/**
 * Puertos de la vigilancia de plazos (ADR-0024 §3.6). Los implementa `infrastructure/`; el caso de
 * uso solo conoce estas formas.
 */

/** Las agencias que pueden tener plazos que vigilar. Solo ids: nada más de «todas las agencias». */
export abstract class PuertoDeAgenciasVigilables {
  abstract agenciasActivas(): Promise<string[]>;
}

export abstract class RepositorioDeAvisosDePlazo {
  /**
   * Una pasada sobre UNA agencia, en una sola transacción bajo su RLS: relee las reservas
   * candidatas con `FOR UPDATE SKIP LOCKED`, reevalúa la condición, escribe cada marca con
   * `WHERE aviso_… IS NULL` y el evento en el outbox, todo junto. Devuelve cuántos avisos
   * escribió. Nunca cambia el estado de una reserva.
   */
  abstract avisarAgencia(tenantId: string, ahora: Date): Promise<number>;
}
