/** Puerto de lectura del historial de precios (T-047): se implementa sobre `registros_auditoria`. */

export interface FilaDeHistorial {
  /** Id de la fila de auditoría, en texto (bigint): también es el cursor. */
  readonly id: string;
  readonly ocurridoEn: Date;
  readonly usuarioId: string | null;
  /** `null` en los registros anteriores a T-071. */
  readonly tipoDeActor: 'USUARIO' | 'CLAVE_DE_API' | null;
  readonly claveDeApiId: string | null;
  readonly accion: string;
  readonly detalle: unknown;
}

export abstract class LectorDeHistorial {
  /**
   * Hasta `tope` filas de precio de la tarifa, más reciente primero, con id menor que `cursor`.
   * `null` si la tarifa no existe en esta agencia y tampoco deja rastro de auditoría.
   */
  abstract leer(
    tarifaId: string,
    tope: number,
    cursor: string | undefined,
  ): Promise<readonly FilaDeHistorial[] | null>;
}
