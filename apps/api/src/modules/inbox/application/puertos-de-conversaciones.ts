/**
 * Los puertos de la bandeja que ve el asesor (lectura y acciones sobre una conversación).
 *
 * **Todo método recibe la `Visibilidad` de quien pregunta**, y el adaptador la aplica a la consulta
 * (`filtroDeVisibilidad`). Es el único camino: no hay un método «sin visibilidad» para la API.
 * Cuando una conversación no existe O no se ve, el método devuelve `null`, y el caso de uso lanza
 * el mismo `ConversacionNoEncontradaError` para ambos.
 */
import type {
  AdjuntoDeConversacion,
  ConsultarBandeja,
  ConsultarMensajes,
  ContadoresBandeja,
  ConversacionDetalle,
  ConversacionResumen,
  EnviarCotizacionCuerpo,
  EstadoConversacion,
  Mensaje,
  NotaDeConversacion,
  PaginaBandeja,
  PaginaMensajes,
} from '@viajapro/contracts';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';

export abstract class PuertoConversaciones {
  abstract listar(
    v: Visibilidad,
    usuarioId: string | null,
    consulta: ConsultarBandeja,
    ahora: Date,
  ): Promise<PaginaBandeja>;

  abstract contadores(v: Visibilidad, usuarioId: string | null): Promise<ContadoresBandeja>;

  abstract detalle(v: Visibilidad, id: string, ahora: Date): Promise<ConversacionDetalle | null>;

  abstract mensajes(
    v: Visibilidad,
    id: string,
    consulta: ConsultarMensajes,
  ): Promise<PaginaMensajes | null>;

  abstract notas(v: Visibilidad, id: string): Promise<NotaDeConversacion[] | null>;

  /** `null`: la conversación no existe o no se ve. `{ adjunto: null }`: se ve, pero no tiene ese adjunto. */
  abstract adjunto(
    v: Visibilidad,
    id: string,
    adjuntoId: string,
  ): Promise<{ adjunto: AdjuntoDeConversacion | null } | null>;

  /**
   * Guarda un mensaje saliente (pendiente de envío) y, si la conversación no tenía asesor, se la
   * asigna a `autorId`. Idempotente por `claveIdempotencia`. Lanza `VentanaCerradaError` fuera de
   * la ventana de 24 h. Escribe sus eventos en el outbox en la misma transacción.
   */
  abstract responder(
    v: Visibilidad,
    autorId: string | null,
    id: string,
    entrada: { texto: string; claveIdempotencia: string },
    ahora: Date,
  ): Promise<Mensaje | null>;

  /**
   * Envía una cotización guardada como mensaje formateado de WhatsApp (T-073, T-074).
   * Lanza `VentanaCerradaError` si la ventana de 24h está cerrada.
   */
  abstract enviarCotizacion(
    v: Visibilidad,
    autorId: string | null,
    id: string,
    entrada: EnviarCotizacionCuerpo,
    ahora: Date,
  ): Promise<Mensaje | null>;

  /** Una nota interna. **No asigna.** */
  abstract crearNota(
    v: Visibilidad,
    autorId: string | null,
    id: string,
    texto: string,
  ): Promise<NotaDeConversacion | null>;

  /** Deja el contador de sin leer en cero. **No asigna.** `false`: no existe o no se ve. */
  abstract marcarLeida(v: Visibilidad, id: string): Promise<boolean>;

  /** **No asigna.** */
  abstract cambiarEstado(
    v: Visibilidad,
    id: string,
    estado: EstadoConversacion,
    actorId: string | null,
    ahora: Date,
  ): Promise<ConversacionResumen | null>;

  /**
   * Toma, reasigna o suelta (`usuarioId` nulo). Lanza `UsuarioNoAsignableError` si el destino no es
   * un miembro activo de ESTA agencia. Sin cambio real no escribe evento.
   */
  abstract asignar(
    v: Visibilidad,
    id: string,
    usuarioId: string | null,
    actorId: string | null,
    ahora: Date,
  ): Promise<ConversacionResumen | null>;
}
