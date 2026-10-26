/**
 * Comprobación de `Origin` para las rutas con cookie que no pasan por Better Auth.
 *
 * Better Auth ya la hace en iniciar y cerrar sesión (su `originCheckMiddleware`). Cambiar de
 * agencia es una ruta nuestra y escribe en la sesión, así que necesita la misma barrera: la
 * cookie es `SameSite=Lax`, que ya frena el POST entre sitios, y esto es el segundo cerrojo.
 *
 * Una petición con cookie y sin `Origin` se rechaza: un navegador siempre lo envía en un POST, y
 * quien no lo envía no es un navegador al que haya que proteger de un tercero.
 */
export function origenEsDeConfianza(
  origen: string | undefined,
  deConfianza: readonly string[],
): boolean {
  if (!origen || origen === 'null') return false;
  let normalizado: string;
  try {
    normalizado = new URL(origen).origin;
  } catch {
    return false;
  }
  return deConfianza.some((o) => {
    try {
      return new URL(o).origin === normalizado;
    } catch {
      return false;
    }
  });
}

/** Los orígenes desde los que un navegador puede llamar con cookie: la web. */
export function origenesDeConfianzaDeLaWeb(entorno: Record<string, string | undefined>): string[] {
  return [entorno['WEB_PUBLIC_URL'] ?? 'http://localhost:3000'];
}

/** Códigos de error de acceso compartidos para la comprobación de Origin. */
export const CODIGOS_DE_ERROR_DE_ACCESO = {
  ORIGEN_NO_CONFIABLE: 'ORIGEN_NO_CONFIABLE',
} as const;
