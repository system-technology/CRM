/**
 * Los puertos del barrido de changes pendientes. Clases abstractas por el mismo motivo que el
 * resto de puertos: Nest necesita un símbolo en ejecución para inyectar.
 */

export interface ChangePendiente {
  recepcionId: Buffer;
  indice: number;
  /** Segundos desde que se recibió. Solo para registro y orden: no es dato personal. */
  antiguedadS: number;
}

/** Los changes que siguen `PENDIENTE` y conservan su contenido, los más antiguos primero. */
export abstract class PuertoPendientes {
  abstract listar(antiguedadMinimaS: number, limite: number): Promise<ChangePendiente[]>;
}

/** La cola, vista por el barrido: saber si un change ya tiene trabajo vivo y volver a darlo. */
export abstract class PuertoReencolador {
  /** `true` si hay un trabajo en espera, en curso o diferido con ese identificador. */
  abstract enCola(recepcionId: Buffer, indice: number): Promise<boolean>;
  /**
   * Deja un trabajo nuevo, quitando antes el fallido o el completado con el mismo identificador:
   * BullMQ descarta EN SILENCIO un `add` cuyo `jobId` ya existe, y un change que agotó sus
   * reintentos (o que el consumidor devolvió sin cerrar) quedaría pendiente para siempre.
   */
  abstract reencolar(recepcionId: Buffer, indice: number): Promise<void>;
}

/** Lo que comparten los trabajadores para no pisarse: un turno por intervalo y un tope por change. */
export abstract class PuertoCoordinacionDelBarrido {
  /** `true` si este proceso se queda con el turno del intervalo; los demás saltan el barrido. */
  abstract adquirirTurno(duracionMs: number): Promise<boolean>;
  /** Cuenta un reencolado de ese change y devuelve cuántos lleva. Caduca solo. */
  abstract contarReencolado(recepcionId: Buffer, indice: number): Promise<number>;
}
