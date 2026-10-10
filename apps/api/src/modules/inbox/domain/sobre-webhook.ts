/**
 * Desglose del sobre que manda Meta.
 *
 * Un `POST` **no** es un mensaje: es un lote. Trae `entry[]`, y cada entrada trae `changes[]`.
 * Y lo que importa, verificado contra Meta: **las entradas pueden ser de WABA distintas**, es
 * decir, de agencias distintas en el mismo lote.
 *
 * De ahí sale la decisión del ADR-0008 §4: el grano de trabajo es el `change`, no la petición.
 * Un diseño con «un tenant por POST» funciona hasta el día que Meta agrupa dos agencias — y ese
 * día las mezcla.
 *
 * **El índice es orden aplanado sobre `entry[].changes[]`**, fijado así a propósito: forma parte
 * de la clave de idempotencia, y dos convenciones distintas producirían identificadores
 * distintos para el mismo reintento. Con eso, la idempotencia dejaría de existir sin que nada
 * fallara.
 *
 * Esto es lógica pura: no toca base de datos ni resuelve tenants. Eso viene después, con el
 * directorio de enrutamiento.
 */

/** Un `change` con su sitio en el lote. El índice es parte de su identidad. */
export interface CambioDelLote {
  /** Orden aplanado sobre `entry[].changes[]`, empezando en 0. */
  indice: number;
  /** `entry[].id` — el WABA. Única pista de tenant en los eventos de gestión. */
  cuentaId: string;
  /** `changes[].field`: `messages`, `message_template_status_update`, `account_update`… */
  campo: string;
  /** `changes[].value` sin interpretar. Lo entiende el trabajador, no el endpoint. */
  valor: unknown;
  /**
   * `value.metadata.phone_number_id` cuando lo hay.
   *
   * **Los eventos de gestión no traen `metadata`**, así que esto es nulo en ellos y el tenant
   * tiene que resolverse por el WABA. Por eso el directorio del ADR-0008 lleva dos claves.
   */
  numeroId: string | null;
}

export type ResultadoSobre =
  | { ok: true; cambios: CambioDelLote[] }
  | { ok: false; motivo: 'JSON_INVALIDO' | 'NO_ES_WHATSAPP' | 'SIN_CAMBIOS' };

function comoRegistro(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

function textoONulo(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null;
}

/**
 * Desglosa el cuerpo crudo en sus `change`.
 *
 * **Se parsea DESPUÉS de verificar la firma, nunca antes.** El orden no es estilo: la firma se
 * calcula sobre estos bytes exactos, y cualquier middleware que parsee primero rompe la
 * verificación de forma que solo se nota cuando alguien escribe con tilde.
 */
export function desglosarSobre(cuerpo: Buffer): ResultadoSobre {
  let crudo: unknown;
  try {
    crudo = JSON.parse(cuerpo.toString('utf8'));
  } catch {
    return { ok: false, motivo: 'JSON_INVALIDO' };
  }

  const raiz = comoRegistro(crudo);
  if (!raiz) return { ok: false, motivo: 'JSON_INVALIDO' };

  // Meta puede mandar webhooks de otros productos a la misma app. No son nuestros.
  if (raiz['object'] !== 'whatsapp_business_account') {
    return { ok: false, motivo: 'NO_ES_WHATSAPP' };
  }

  const entradas = Array.isArray(raiz['entry']) ? raiz['entry'] : [];
  const cambios: CambioDelLote[] = [];
  let indice = 0;

  for (const entradaCruda of entradas) {
    const entrada = comoRegistro(entradaCruda);
    if (!entrada) continue;

    const cuentaId = textoONulo(entrada['id']);
    const listaCambios = Array.isArray(entrada['changes']) ? entrada['changes'] : [];

    for (const cambioCrudo of listaCambios) {
      const cambio = comoRegistro(cambioCrudo);
      if (!cambio) continue;

      const campo = textoONulo(cambio['field']);
      // Un `change` sin `field` o una entrada sin `id` no se puede enrutar ni interpretar.
      // **El índice avanza igual**: si se saltara, el mismo lote reenviado por Meta produciría
      // índices distintos y la idempotencia dejaría de funcionar en silencio.
      if (!cuentaId || !campo) {
        indice += 1;
        continue;
      }

      const valor = cambio['value'];
      const metadatos = comoRegistro(comoRegistro(valor)?.['metadata']);

      cambios.push({
        indice,
        cuentaId,
        campo,
        valor,
        numeroId: textoONulo(metadatos?.['phone_number_id']),
      });
      indice += 1;
    }
  }

  if (cambios.length === 0) return { ok: false, motivo: 'SIN_CAMBIOS' };
  return { ok: true, cambios };
}
