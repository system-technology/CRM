/**
 * Nadie reparte ni toca más de lo que tiene (ADR-0011): la regla de inclusión que comparten las
 * invitaciones y las bajas. Un permiso que el catálogo no conoce no se tiene: ante la duda, se niega.
 */
export function permisoQueFalta(
  requeridos: readonly string[],
  tiene: ReadonlySet<string>,
): string | undefined {
  return requeridos.find((p) => !tiene.has(p));
}
