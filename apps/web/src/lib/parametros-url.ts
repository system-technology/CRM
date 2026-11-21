/**
 * Lectura segura de parámetros de la URL (T-318, N5).
 *
 * La URL es entrada del usuario: un `?id=` o un `?pestana=` nunca se usa en una llamada a la API
 * ni para elegir qué se pinta sin pasar antes por aquí. Los ids son UUID (la forma, no la versión:
 * los de demostración y los de la base son UUID v4/v7); las pestañas, una lista cerrada.
 */

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LectorDeParametros {
  get(nombre: string): string | null;
}

export function esUuid(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && FORMA_UUID.test(valor);
}

export type ParametroDeId =
  { estado: 'ausente' } | { estado: 'invalido' } | { estado: 'valido'; id: string };

/** Distingue «no vino» de «vino mal formado» para poder avisar al usuario en el segundo caso. */
export function leerIdDeUrl(params: LectorDeParametros, nombre: string): ParametroDeId {
  const crudo = params.get(nombre);
  if (crudo === null || crudo === '') return { estado: 'ausente' };
  return esUuid(crudo) ? { estado: 'valido', id: crudo } : { estado: 'invalido' };
}

/** Devuelve la pestaña pedida si está en la lista cerrada; si no, la primera. */
export function leerPestanaDeUrl<T extends string>(
  params: LectorDeParametros,
  permitidas: readonly [T, ...T[]],
): T {
  const crudo = params.get('pestana');
  return permitidas.find((p) => p === crudo) ?? permitidas[0];
}

/** `?pestana=` en la ruta dada; la primera pestaña es la de por defecto y no ensucia la URL. */
export function hrefDePestana<T extends string>(
  ruta: string,
  pestana: T,
  permitidas: readonly [T, ...T[]],
  otrosParametros?: LectorDeParametros & { toString(): string },
): string {
  const q = new URLSearchParams(otrosParametros?.toString() ?? '');
  if (pestana === permitidas[0]) q.delete('pestana');
  else q.set('pestana', pestana);
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}
