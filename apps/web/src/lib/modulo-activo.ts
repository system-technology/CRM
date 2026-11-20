/**
 * Qué módulo del menú lateral está activo para una ruta (ADR-0032 §3, N1).
 *
 * Es la versión mínima y pura de `moduloActivo()` de `lib/navegacion.ts`: se mueve allí cuando
 * T-316 cree la tabla única. Gana el prefijo más largo. Solo conoce los módulos que existen hoy
 * en el menú: «Hoy», «Seguimientos» y «Cotizaciones» (`/cotizaciones/*`) no son ítems todavía
 * (T-317), así que esas rutas no activan ninguno. `/ensayo` es privada y queda fuera del menú.
 */

export type IdDeModulo =
  | 'bandeja'
  | 'pipeline'
  | 'cotizador'
  | 'viajes'
  | 'contactos'
  | 'catalogo'
  | 'reportes'
  | 'configuracion';

const PREFIJOS_POR_MODULO: ReadonlyArray<readonly [IdDeModulo, readonly string[]]> = [
  ['bandeja', ['/bandeja']],
  ['pipeline', ['/pipeline']],
  ['cotizador', ['/cotizador']],
  ['viajes', ['/viajes']],
  ['contactos', ['/contactos']],
  ['catalogo', ['/catalogo']],
  ['reportes', ['/reportes']],
  ['configuracion', ['/configuracion', '/bienvenida']],
];

function coincide(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(prefijo + '/');
}

export function moduloActivo(pathname: string | null | undefined): IdDeModulo | null {
  if (!pathname) return null;
  const ruta = pathname.split(/[?#]/)[0] ?? '';
  let mejor: IdDeModulo | null = null;
  let largo = -1;
  for (const [id, prefijos] of PREFIJOS_POR_MODULO) {
    for (const p of prefijos) {
      if (coincide(ruta, p) && p.length > largo) {
        mejor = id;
        largo = p.length;
      }
    }
  }
  return mejor;
}

/** `/bandeja/[id]`: en móvil la conversación va a pantalla completa y se oculta la barra inferior. */
export function esDetalleMovilDeBandeja(pathname: string | null | undefined): boolean {
  return Boolean(pathname && pathname !== '/bandeja' && pathname.startsWith('/bandeja/'));
}
