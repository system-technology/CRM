/** Regla pura (T-122): un número «conectado» es uno activo cuya cuenta también lo está. */
export type EstadoDeCanalOCuenta = 'ACTIVO' | 'SUSPENDIDO' | 'REVOCADO';

export function estaConectado(
  estadoCanal: EstadoDeCanalOCuenta,
  estadoCuenta: EstadoDeCanalOCuenta,
): boolean {
  return estadoCanal === 'ACTIVO' && estadoCuenta === 'ACTIVO';
}
