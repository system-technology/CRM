/**
 * Lo que trae un `change` de campo `messages`, desglosado.
 *
 * **Esta es la pieza que falta para recibir un WhatsApp de verdad.** El sobre ya está desglosado
 * (`sobre-webhook.ts`), la firma verificada y el `change` guardado cifrado. Falta traducir su
 * `value` —que Meta manda sin tipar— a lo que el inbox entiende.
 *
 * Lógica pura: ni base de datos, ni reloj, ni tenant. Todo lo que decide sale del propio sobre.
 *
 * **Tres cosas que Meta hace y que muerden si no se saben:**
 *
 * 1. **`timestamp` viene en SEGUNDOS, como cadena.** Tratarlo como milisegundos pone los mensajes
 *    en enero de 1970, y la ventana de servicio de 24 horas sale cerrada siempre.
 * 2. **Los teléfonos vienen SIN el `+`.** `573001234567`, no `+573001234567`. Si se guardan tal
 *    cual, el mismo viajero es dos contactos distintos según por dónde entre.
 * 3. **Un mismo `value` puede traer mensajes Y estados a la vez.** Quedarse con lo primero que
 *    aparezca pierde acuses de entrega en silencio.
 */

/** Qué clase de evento es. Los dos llegan por el mismo `change`. */
export type TipoContenido =
  | 'TEXTO'
  | 'IMAGEN'
  | 'DOCUMENTO'
  | 'AUDIO'
  | 'VIDEO'
  | 'UBICACION'
  | 'CONTACTO'
  | 'PLANTILLA'
  | 'INTERACTIVO'
  | 'REACCION'
  | 'NO_SOPORTADO';

export type EstadoMensaje =
  'PENDIENTE' | 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'REPRODUCIDO' | 'FALLIDO';

export interface MensajeEntrante {
  /** `wamid`. Es la clave de idempotencia: Meta reintenta y manda el mismo dos veces (R5). */
  wamid: string;
  /** E.164, con el `+` que Meta no pone. */
  deTelefono: string;
  /** El nombre que el viajero tiene puesto en su WhatsApp. Puede faltar. */
  nombrePerfil: string | null;
  /** Instante del evento según Meta, no nuestro reloj: de aquí sale la ventana de 24 h. */
  instante: Date;
  tipo: TipoContenido;
  /** El texto cuando lo hay: cuerpo, pie de foto, título del botón o emoji de la reacción. */
  texto: string | null;
  /** Identificador del medio en Meta, para descargarlo después con el token de la agencia. */
  medioId: string | null;
  nombreArchivo: string | null;
  mimeType: string | null;
  /** `context.id`: a qué mensaje nuestro responde. Es lo que enhebra la conversación. */
  respondeA: string | null;
  /** En una reacción, el mensaje reaccionado. Una reacción vacía es una reacción RETIRADA. */
  reaccionaA: string | null;
}

export interface CambioDeEstado {
  /** El `wamid` del mensaje NUESTRO cuyo estado cambia. */
  wamid: string;
  estado: EstadoMensaje;
  instante: Date;
  /** E.164. */
  deTelefono: string | null;
  /** Código de error de Meta cuando el estado es `FALLIDO`. */
  codigoError: number | null;
  mensajeError: string | null;
  /**
   * `biz_opaque_callback_data`: el id de NUESTRO mensaje, que el envío le pasa a Meta y Meta
   * devuelve en cada estado. Correlaciona el estado aunque todavía no sepamos el `wamid` (la
   * respuesta del envío se perdió o llegó después que el webhook). Solo se acepta si es un UUID:
   * cualquier otra cosa no la pusimos nosotros. ADR-0018 §4.
   */
  referencia: string | null;
}

export interface ContenidoDelCambio {
  mensajes: MensajeEntrante[];
  estados: CambioDeEstado[];
}

function comoRegistro(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

function comoLista(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function texto(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null;
}

function comoUuid(x: unknown): string | null {
  const t = texto(x);
  return t !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
    ? t.toLowerCase()
    : null;
}

/**
 * `+` delante, y nada más.
 *
 * No se normaliza de otra forma a propósito: Meta ya devuelve el número en formato internacional
 * sin signo, y «arreglarlo» más —quitar ceros, adivinar el país— es justo como se corrompe un
 * teléfono que estaba bien.
 */
export function aE164(crudo: unknown): string | null {
  const t = texto(crudo);
  if (t === null) return null;
  const limpio = t.startsWith('+') ? t.slice(1) : t;
  if (!/^[1-9]\d{7,14}$/.test(limpio)) return null;
  return `+${limpio}`;
}

/**
 * El `timestamp` de Meta: **segundos**, en una cadena.
 *
 * Devuelve `null` si no es un número utilizable, para que quien llame decida —y no para que se
 * cuele un `Invalid Date` hasta la pantalla—.
 */
export function instanteDeMeta(crudo: unknown): Date | null {
  const t = typeof crudo === 'number' ? String(crudo) : texto(crudo);
  if (t === null || !/^\d{1,13}$/.test(t)) return null;
  const segundos = Number(t);
  if (!Number.isSafeInteger(segundos) || segundos <= 0) return null;
  return new Date(segundos * 1000);
}

/** El `type` de Meta al vocabulario nuestro. Lo que no conocemos es `NO_SOPORTADO`, no un error. */
function tipoDeMeta(t: string | null): TipoContenido {
  switch (t) {
    case 'text':
      return 'TEXTO';
    case 'image':
      return 'IMAGEN';
    case 'document':
      return 'DOCUMENTO';
    case 'audio':
    case 'voice':
      return 'AUDIO';
    case 'video':
      return 'VIDEO';
    case 'sticker':
      return 'IMAGEN';
    case 'location':
      return 'UBICACION';
    case 'contacts':
      return 'CONTACTO';
    case 'button':
    case 'interactive':
      return 'INTERACTIVO';
    case 'reaction':
      return 'REACCION';
    default:
      // Meta añade tipos sin avisar. Un `NO_SOPORTADO` guardado con su `wamid` deja la
      // conversación completa y permite responder; descartarlo haría desaparecer un mensaje que
      // el viajero SÍ mandó, y el asesor vería un hueco sin explicación.
      return 'NO_SOPORTADO';
  }
}

/** El `status` de Meta. `warning` existe y no es un estado de entrega: no se inventa uno. */
function estadoDeMeta(s: string | null): EstadoMensaje | null {
  switch (s) {
    case 'sent':
      return 'ENVIADO';
    case 'delivered':
      return 'ENTREGADO';
    case 'read':
      return 'LEIDO';
    // Desde 2025-11-03: el usuario reprodujo una nota de voz (§5.4 de la integración).
    case 'played':
      return 'REPRODUCIDO';
    case 'failed':
      return 'FALLIDO';
    default:
      return null;
  }
}

/** El texto visible según el tipo, que Meta guarda en un sitio distinto en cada uno. */
function textoDelMensaje(m: Record<string, unknown>, tipo: TipoContenido): string | null {
  if (tipo === 'TEXTO') return texto(comoRegistro(m['text'])?.['body']);
  if (tipo === 'REACCION') return texto(comoRegistro(m['reaction'])?.['emoji']);

  if (tipo === 'INTERACTIVO') {
    const boton = comoRegistro(m['button']);
    if (boton) return texto(boton['text']);
    const interactivo = comoRegistro(m['interactive']);
    if (interactivo) {
      const respuestaBoton = comoRegistro(interactivo['button_reply']);
      if (respuestaBoton) return texto(respuestaBoton['title']);
      const respuestaLista = comoRegistro(interactivo['list_reply']);
      if (respuestaLista) return texto(respuestaLista['title']);
    }
    return null;
  }

  // El pie de foto de una imagen o un documento es texto del viajero y suele llevar la pregunta
  // de verdad: «¿cuánto vale este?». Perderlo deja la conversación sin sentido.
  for (const clave of ['image', 'document', 'video', 'audio']) {
    const medio = comoRegistro(m[clave]);
    const pie = texto(medio?.['caption']);
    if (pie !== null) return pie;
  }
  return null;
}

/** El bloque del medio, si el tipo lo tiene. */
function medioDelMensaje(m: Record<string, unknown>): {
  id: string | null;
  nombreArchivo: string | null;
  mimeType: string | null;
} {
  for (const clave of ['image', 'document', 'audio', 'video', 'sticker']) {
    const medio = comoRegistro(m[clave]);
    if (medio) {
      return {
        id: texto(medio['id']),
        nombreArchivo: texto(medio['filename']),
        mimeType: texto(medio['mime_type']),
      };
    }
  }
  return { id: null, nombreArchivo: null, mimeType: null };
}

/**
 * Desglosa el `value` de un `change` de campo `messages`.
 *
 * **Nunca lanza.** Un webhook mal formado no puede tumbar el trabajador: Meta reintentaría el
 * lote entero y volvería a tumbarlo. Lo que no se entiende se omite, y el `change` queda
 * guardado con su payload para poder mirarlo después.
 */
export function contenidoDelCambio(valor: unknown): ContenidoDelCambio {
  const vacio: ContenidoDelCambio = { mensajes: [], estados: [] };
  const v = comoRegistro(valor);
  if (!v) return vacio;

  // El nombre del perfil viaja en `contacts[]`, aparte de los mensajes, emparejado por `wa_id`.
  const perfiles = new Map<string, string>();
  for (const c of comoLista(v['contacts'])) {
    const contacto = comoRegistro(c);
    const waId = aE164(contacto?.['wa_id']);
    const nombre = texto(comoRegistro(contacto?.['profile'])?.['name']);
    if (waId && nombre) perfiles.set(waId, nombre);
  }

  const mensajes: MensajeEntrante[] = [];
  for (const crudo of comoLista(v['messages'])) {
    const m = comoRegistro(crudo);
    if (!m) continue;

    const wamid = texto(m['id']);
    const deTelefono = aE164(m['from']);
    const instante = instanteDeMeta(m['timestamp']);
    // Sin identidad, sin remitente o sin instante no hay mensaje que guardar: el `wamid` es la
    // clave de idempotencia y el instante gobierna la ventana de 24 horas.
    if (!wamid || !deTelefono || !instante) continue;

    const tipo = tipoDeMeta(texto(m['type']));
    const medio = medioDelMensaje(m);
    const reaccion = comoRegistro(m['reaction']);

    mensajes.push({
      wamid,
      deTelefono,
      nombrePerfil: perfiles.get(deTelefono) ?? null,
      instante,
      tipo,
      texto: textoDelMensaje(m, tipo),
      medioId: medio.id,
      nombreArchivo: medio.nombreArchivo,
      mimeType: medio.mimeType,
      respondeA: texto(comoRegistro(m['context'])?.['id']),
      reaccionaA: texto(reaccion?.['message_id']),
    });
  }

  const estados: CambioDeEstado[] = [];
  for (const crudo of comoLista(v['statuses'])) {
    const s = comoRegistro(crudo);
    if (!s) continue;

    const wamid = texto(s['id']);
    const estado = estadoDeMeta(texto(s['status']));
    const instante = instanteDeMeta(s['timestamp']);
    if (!wamid || !estado || !instante) continue;

    // Los errores vienen en una lista aunque casi siempre traiga uno.
    const primerError = comoRegistro(comoLista(s['errors'])[0]);
    const codigo = primerError?.['code'];

    estados.push({
      wamid,
      estado,
      instante,
      deTelefono: aE164(s['recipient_id']),
      codigoError: typeof codigo === 'number' ? codigo : null,
      mensajeError:
        texto(primerError?.['title']) ??
        texto(comoRegistro(primerError?.['error_data'])?.['details']),
      referencia: comoUuid(s['biz_opaque_callback_data']),
    });
  }

  return { mensajes, estados };
}
