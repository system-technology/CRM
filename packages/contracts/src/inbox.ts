/**
 * Contratos de la bandeja de conversaciones.
 *
 * **Esta es la costura entre la web y la API.** La bandeja se construye contra estos esquemas
 * sin esperar al backend, y el backend los cumple sin esperar a la interfaz. Si alguno de los
 * dos lados necesita un campo que no está aquí, se añade aquí primero — nunca en el otro lado
 * «mientras tanto» (regla R3).
 *
 * Vocabulario: `docs/01-producto/02-lenguaje-ubicuo.md`. Los nombres de dominio van en inglés
 * en el código y en español en la documentación; aquí manda el diccionario.
 *
 * Lo que viene de Meta está verificado en `docs/04-integraciones/01-whatsapp-cloud-api.md`.
 */

import { z } from 'zod';
import { Id, Instante, TelefonoE164, pagina } from './comunes.js';

// =============================================================================
// Mensajes
// =============================================================================

/** Quién lo escribió. `SALIENTE` incluye tanto al asesor como a la automatización. */
export const DireccionMensaje = z.enum(['ENTRANTE', 'SALIENTE']);
export type DireccionMensaje = z.infer<typeof DireccionMensaje>;

/**
 * Estado de entrega, tal como lo reporta Meta.
 *
 * `REPRODUCIDO` existe desde 2025-11-03 y solo aplica a notas de voz. `FALLIDO` es **terminal
 * y gana siempre**: Meta documenta que un mismo mensaje puede emitir `entregado` y `fallido`,
 * y mostrar «entregado» sobre algo que no llegó es peor que no mostrar nada.
 */
export const EstadoMensaje = z.enum([
  'PENDIENTE',
  'ENVIADO',
  'ENTREGADO',
  'LEIDO',
  'REPRODUCIDO',
  'FALLIDO',
]);
export type EstadoMensaje = z.infer<typeof EstadoMensaje>;

export const TipoContenido = z.enum([
  'TEXTO',
  'IMAGEN',
  'DOCUMENTO',
  'AUDIO',
  'VIDEO',
  'UBICACION',
  'CONTACTO',
  'PLANTILLA',
  'INTERACTIVO',
  'REACCION',
  'NO_SOPORTADO',
]);
export type TipoContenido = z.infer<typeof TipoContenido>;

/**
 * Adjunto ya descargado y guardado por nosotros.
 *
 * La URL es **nuestra y temporal**, nunca la de Meta: sus enlaces caducan y exigen el token de
 * la agencia, así que no se pueden poner en un `<img>`.
 */
export const Adjunto = z.object({
  id: Id,
  tipo: TipoContenido,
  url: z.string().url(),
  nombreArchivo: z.string().max(255).nullable(),
  tamanoBytes: z.number().int().min(0).nullable(),
  mimeType: z.string().max(100).nullable(),
});
export type Adjunto = z.infer<typeof Adjunto>;

export const Mensaje = z.object({
  id: Id,
  conversacionId: Id,
  direccion: DireccionMensaje,
  tipo: TipoContenido,
  /** Texto plano. Vacío en mensajes que son solo adjunto o reacción. */
  texto: z.string().nullable(),
  adjuntos: z.array(Adjunto).default([]),
  estado: EstadoMensaje,
  /**
   * Motivo cuando `estado` es `FALLIDO`, ya traducido a algo que un asesor entienda.
   * El código de Meta se guarda aparte: aquí va lo que se muestra.
   */
  motivoFallo: z.string().nullable(),
  /** Quién lo envió. Nulo en los entrantes y en los que manda una automatización. */
  autorId: Id.nullable(),
  autorNombre: z.string().max(200).nullable(),
  /** Instante del evento según Meta, no el de nuestra base. Llegan desordenados. */
  ocurridoEn: Instante,
  /**
   * La cotización que este mensaje llevaba, si llevaba alguna.
   *
   * **No es un tipo de contenido.** Para Meta esto es un `DOCUMENTO`: un PDF como cualquier
   * otro, y `TipoContenido` solo admite lo que Meta entrega. Lo que convierte ese PDF en una
   * tarjeta de propuesta dentro del hilo —con precio, vigencia y un botón para abrirla— es que
   * **nuestro** registro recuerda cuál era. Esa memoria vive aquí.
   *
   * Lleva `default(null)` para que los mensajes que ya existen sigan validando sin tocarlos.
   */
  cotizacionId: Id.nullable().default(null),
});
export type Mensaje = z.infer<typeof Mensaje>;

// =============================================================================
// Conversación
// =============================================================================

export const EstadoConversacion = z.enum(['ABIERTA', 'EN_ESPERA', 'CERRADA']);
export type EstadoConversacion = z.infer<typeof EstadoConversacion>;

/**
 * La ventana de servicio de 24 horas.
 *
 * **La calculamos nosotros.** Meta retiró el objeto `conversation` de los webhooks de estado en
 * la v24.0, así que ya no hay un campo que diga cuándo expira: se deriva del último mensaje
 * **del cliente**. `expiraEn` es nulo cuando nunca ha escrito.
 *
 * Importa en la interfaz, no es un detalle: **fuera de la ventana no se puede escribir texto
 * libre**, solo plantillas aprobadas. La bandeja tiene que decirlo antes de que el asesor
 * escriba, no después de que falle el envío.
 */
export const VentanaServicio = z.object({
  abierta: z.boolean(),
  expiraEn: Instante.nullable(),
  /** Minutos que quedan. Negativo si ya expiró. Nulo si nunca hubo mensaje del cliente. */
  minutosRestantes: z.number().int().nullable(),
});
export type VentanaServicio = z.infer<typeof VentanaServicio>;

/**
 * Fila de la bandeja.
 *
 * Trae **todo lo que la lista necesita pintar**, a propósito: una bandeja que tiene que pedir
 * un detalle por fila para saber si está vencida no se puede ordenar ni filtrar en el servidor,
 * y con 500 conversaciones se nota.
 */
export const ConversacionResumen = z.object({
  id: Id,
  contactoId: Id,
  contactoNombre: z.string().max(200).nullable(),
  contactoTelefono: TelefonoE164,
  estado: EstadoConversacion,
  ventana: VentanaServicio,
  /** Asesor responsable. Nulo = sin asignar, que en la bandeja es una columna propia. */
  asignadoAId: Id.nullable(),
  asignadoANombre: z.string().max(200).nullable(),
  /** Para la vista previa de la lista. Recortado por el servidor, no por la web. */
  ultimoMensajeTexto: z.string().max(200).nullable(),
  ultimoMensajeEn: Instante.nullable(),
  ultimoMensajeDireccion: DireccionMensaje.nullable(),
  mensajesSinLeer: z.number().int().min(0),
  /**
   * Plazo comprometido de primera respuesta. `vencidoEn` en el pasado se pinta en rojo; a menos
   * de una hora, en ámbar. Nulo cuando ya se respondió o cuando la agencia no fijó SLA.
   */
  slaVenceEn: Instante.nullable(),
  etiquetas: z.array(z.string().max(40)).default([]),
});
export type ConversacionResumen = z.infer<typeof ConversacionResumen>;

/** La conversación abierta, con su historial. */
export const ConversacionDetalle = ConversacionResumen.extend({
  mensajes: z.array(Mensaje),
  /** Notas del equipo. **Nunca se envían al cliente**: la interfaz debe distinguirlas a simple vista. */
  notas: z.array(
    z.object({
      id: Id,
      texto: z.string(),
      autorId: Id,
      autorNombre: z.string().max(200),
      creadaEn: Instante,
    }),
  ),
});
export type ConversacionDetalle = z.infer<typeof ConversacionDetalle>;

// =============================================================================
// Consultas
// =============================================================================

export const FiltroBandeja = z.enum(['TODAS', 'MIAS', 'SIN_ASIGNAR', 'SIN_LEER', 'SLA_VENCIDO']);
export type FiltroBandeja = z.infer<typeof FiltroBandeja>;

export const ConsultarBandeja = z.object({
  filtro: FiltroBandeja.default('TODAS'),
  /** Busca en nombre, teléfono y texto de los mensajes. */
  buscar: z.string().max(100).optional(),
  estado: EstadoConversacion.optional(),
  cursor: z.string().optional(),
  limite: z.number().int().min(1).max(100).default(30),
});
export type ConsultarBandeja = z.infer<typeof ConsultarBandeja>;

export const PaginaBandeja = pagina(ConversacionResumen);
export type PaginaBandeja = z.infer<typeof PaginaBandeja>;

// =============================================================================
// Acciones
// =============================================================================

/**
 * Enviar un mensaje de texto.
 *
 * Solo vale **dentro** de la ventana de servicio. Fuera, la API responde
 * `VENTANA_CERRADA` y hay que usar una plantilla. La web debería impedirlo antes de llegar
 * aquí, pero la API no se fía de la web.
 */
export const EnviarTexto = z.object({
  conversacionId: Id,
  texto: z.string().min(1).max(4096),
  /**
   * Clave de idempotencia que genera el cliente. Dos envíos con la misma clave producen **un**
   * mensaje: sin esto, un doble clic o un reintento de red le manda dos veces lo mismo al
   * viajero. R5.
   */
  claveIdempotencia: z.string().uuid(),
});
export type EnviarTexto = z.infer<typeof EnviarTexto>;

export const AsignarConversacion = z.object({
  conversacionId: Id,
  /** Nulo para dejarla sin asignar. */
  usuarioId: Id.nullable(),
});
export type AsignarConversacion = z.infer<typeof AsignarConversacion>;

export const CambiarEstadoConversacion = z.object({
  conversacionId: Id,
  estado: EstadoConversacion,
});
export type CambiarEstadoConversacion = z.infer<typeof CambiarEstadoConversacion>;

export const CrearNota = z.object({
  conversacionId: Id,
  texto: z.string().min(1).max(2000),
});
export type CrearNota = z.infer<typeof CrearNota>;

// =============================================================================
// Tiempo real
// =============================================================================

/**
 * Eventos que la bandeja recibe por websocket.
 *
 * El discriminante es `tipo`. Un evento desconocido **se ignora en silencio**: el servidor puede
 * publicar tipos nuevos antes de que la web sepa pintarlos, y romperse por eso sería absurdo.
 */
export const EventoBandeja = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('MENSAJE_NUEVO'), conversacionId: Id, mensaje: Mensaje }),
  z.object({
    tipo: z.literal('MENSAJE_ACTUALIZADO'),
    conversacionId: Id,
    mensajeId: Id,
    estado: EstadoMensaje,
    motivoFallo: z.string().nullable(),
  }),
  z.object({ tipo: z.literal('CONVERSACION_ACTUALIZADA'), conversacion: ConversacionResumen }),
]);
export type EventoBandeja = z.infer<typeof EventoBandeja>;
