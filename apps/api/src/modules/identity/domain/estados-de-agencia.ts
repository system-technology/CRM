/**
 * Qué estados de agencia dejan entrar (ADR-0011, paso 4: «la agencia no está suspendida»).
 *
 * Una agencia suspendida o cancelada no atiende a nadie, ni siquiera a quien tiene sesión
 * abierta y rol de dueño. En prueba y activa, sí.
 */
export const ESTADOS_DE_AGENCIA_CON_ACCESO: ReadonlySet<string> = new Set(['EN_PRUEBA', 'ACTIVO']);

export function agenciaPermiteAcceso(estado: string): boolean {
  return ESTADOS_DE_AGENCIA_CON_ACCESO.has(estado);
}
