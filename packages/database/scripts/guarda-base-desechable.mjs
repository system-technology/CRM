/**
 * Guarda estructural de `mutaciones-aislamiento.mjs`.
 *
 * Las mutaciones ROMPEN el aislamiento a propósito (quitan RLS, cambian claves foráneas) sobre
 * la base a la que apunte DATABASE_URL. Contra una base compartida ponen en rojo, y a veces
 * abren de verdad, a cualquier otra corrida que esté en marcha. Por eso corren solo si:
 *   (a) VIAJAPRO_BASE_DESECHABLE=1, declarado a propósito, Y
 *   (b) la base es inequívocamente propia: host de loopback (el service container de CI), o un
 *       host que no es de Neon Y una base que no se llama `neondb`.
 * El host sale de la propia URL, no de ningún archivo. En CI la base también se llama neondb:
 * por eso el host loopback basta y el nombre no cuenta.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function evaluarGuarda({ desechable, url, baseActual }) {
  if (desechable !== '1') {
    return { ok: false, motivo: 'falta VIAJAPRO_BASE_DESECHABLE=1' };
  }
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, motivo: 'DATABASE_URL no es una URL legible' };
  }
  if (LOOPBACK.has(host)) return { ok: true, motivo: 'host de loopback' };
  if (host.includes('neon.tech')) {
    return { ok: false, motivo: `el host ${host} es de Neon y puede ser compartido` };
  }
  const base = baseActual ?? new URL(url).pathname.replace(/^\//, '');
  if (base === 'neondb') {
    return { ok: false, motivo: 'la base se llama neondb y el host no es de loopback' };
  }
  return { ok: true, motivo: 'host propio y base con nombre propio' };
}
