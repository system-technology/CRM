/**
 * Puerto de las etiquetas de conversación (T-325).
 *
 * El catálogo es de la agencia de la petición (el tenant sale del contexto, nunca de un argumento).
 * Poner y quitar recibe la `Visibilidad` de quien actúa, igual que el resto de la bandeja: una
 * conversación que no existe y una que no se ve son indistinguibles (`null`).
 *
 * Los eventos del outbox llevan SOLO ids: el nombre de la etiqueta no sale de aquí (R10).
 */
import type {
  ActualizarEtiquetaCuerpo,
  ConversacionResumen,
  CrearEtiquetaCuerpo,
  Etiqueta,
} from '@viajapro/contracts';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';

/** Qué pasó al poner o quitar: la fila de la bandeja ya actualizada, o por qué no se pudo. */
export type ResultadoDeEtiquetar =
  | { resultado: 'OK'; resumen: ConversacionResumen; cambio: boolean }
  | { resultado: 'CONVERSACION_NO_ENCONTRADA' }
  | { resultado: 'ETIQUETA_NO_ENCONTRADA' };

export abstract class PuertoDeEtiquetas {
  /** El catálogo de la agencia, en su orden (empates, por nombre). */
  abstract listar(): Promise<Etiqueta[]>;

  /**
   * Lanza `EtiquetaDuplicadaError`, `TopeDeEtiquetasDeLaAgenciaError` o `EtiquetaInvalidaError`.
   * El nombre ya viene normalizado por el contrato.
   */
  abstract crear(actorId: string | null, datos: CrearEtiquetaCuerpo): Promise<Etiqueta>;

  /** `null`: no existe o es de otra agencia. Lanza `EtiquetaDuplicadaError` al renombrar. */
  abstract actualizar(
    actorId: string | null,
    id: string,
    cambios: ActualizarEtiquetaCuerpo,
  ): Promise<Etiqueta | null>;

  /** Borrado físico: se lleva sus asignaciones. `false`: no existe o es de otra agencia. */
  abstract borrar(id: string): Promise<boolean>;

  /**
   * Idempotente: ponerla dos veces no duplica ni escribe un segundo evento, y repetirla con la
   * conversación en el tope no falla. Lanza `TopeDeEtiquetasDeLaConversacionError` solo si la
   * etiqueta es NUEVA para esa conversación.
   */
  abstract poner(
    v: Visibilidad,
    actorId: string | null,
    conversacionId: string,
    etiquetaId: string,
    ahora: Date,
  ): Promise<ResultadoDeEtiquetar>;

  /** Idempotente: quitar una que no estaba puesta responde igual, sin evento. */
  abstract quitar(
    v: Visibilidad,
    conversacionId: string,
    etiquetaId: string,
    ahora: Date,
  ): Promise<ResultadoDeEtiquetar>;
}
