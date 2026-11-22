// Fuente única de «qué rutas exige la aprobación del Owner»: `humanRequired` en ownership.json.
// La usan check-ownership.mjs (carril) y comprobar-aprobacion-owner.mjs (compuerta de R11).
// No existe una segunda lista: .github/CODEOWNERS es un espejo que se mantiene a mano.
import { readFileSync } from 'node:fs';

export function toRegex(glob) {
  const s = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*');
  return new RegExp(`^${s}$`);
}

export const cargarOwnership = (ruta = new URL('../../ownership.json', import.meta.url)) =>
  JSON.parse(readFileSync(ruta, 'utf8'));
