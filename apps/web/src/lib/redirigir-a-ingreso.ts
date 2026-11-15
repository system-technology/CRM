/**
 * Ruta canónica de acceso (ADR-0011): /ingresar. Los alias (/login, /iniciar-sesion) llevan
 * allí conservando la consulta, para no perder `redirigir` ni `motivo` (H-4, T-174).
 */
export const RUTA_INGRESO = '/ingresar';

/** Única lista de rutas de acceso: la canónica y sus alias. Públicas y nunca destino tras ingresar. */
export const RUTAS_DE_ACCESO = [RUTA_INGRESO, '/iniciar-sesion', '/login'] as const;

type Consulta = Record<string, string | string[] | undefined>;

export function destinoIngresoDesdeAlias(consulta: Consulta | undefined): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(consulta ?? {})) {
    if (valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) params.append(clave, v);
  }
  const qs = params.toString();
  return qs ? `${RUTA_INGRESO}?${qs}` : RUTA_INGRESO;
}
