/**
 * Política de protección de la rama principal — lógica pura, sin efectos.
 *
 * Vive aparte del hook a propósito: así se puede probar de verdad, sin simular ramas con
 * variables de entorno. Una puerta trasera para hacer verificable al guardián sería peor que
 * el defecto que pretende evitar.
 *
 * El hook (`guard-rama.mjs`) lee el estado real y delega aquí la decisión.
 */

export const RAMA_PROTEGIDA = 'main';

/**
 * ¿El comando reescribe el historial de la rama protegida?
 * Esto se bloquea siempre, haya o no autorización: no existe caso legítimo.
 */
export function esDestructivoSobreMain(cmd, ramaActual) {
  const reescribe =
    /git push\b.*(--force\b|--force-with-lease\b|\s-f\b)/.test(cmd) ||
    /git reset\b.*--hard/.test(cmd) ||
    new RegExp(`git branch\\b.*(-D|--delete --force)\\s+${RAMA_PROTEGIDA}\\b`).test(cmd);

  if (!reescribe) return false;
  return ramaActual === RAMA_PROTEGIDA || new RegExp(`\\b${RAMA_PROTEGIDA}\\b`).test(cmd);
}

/**
 * ¿El push toca realmente la rama protegida?
 *
 * Importa distinguirlo: estando en `main`, `git push origin --delete feat/x` o
 * `git push origin feat/x` no escriben una sola línea en la rama protegida. Bloquearlos es un
 * falso positivo, y un guardián que bloquea lo legítimo acaba desactivado.
 */
export function pushTocaMain(cmd, ramaActual) {
  if (!/git push\b/.test(cmd)) return false;

  // Borrado de rama: `--delete <rama>` o la forma con dos puntos `origin :rama`.
  const borrado = cmd.match(/--delete\s+(\S+)|\s:(\S+)/);
  if (borrado) {
    const objetivo = (borrado[1] ?? borrado[2] ?? '').replace(/^.*\//, '');
    return objetivo === RAMA_PROTEGIDA;
  }

  if (new RegExp(`\\b${RAMA_PROTEGIDA}\\b`).test(cmd)) return true;

  // Sin refspec explícita, git empuja la rama actual.
  const tieneRefspec = /git push\s+(?:-{1,2}\S+(?:=\S+)?\s+)*\S+\s+\S+/.test(cmd);
  return !tieneRefspec && ramaActual === RAMA_PROTEGIDA;
}

/**
 * Decide qué hacer con un comando.
 * @returns {{accion: 'permitir'|'bloquear-destructivo'|'exigir-autorizacion', esCommit: boolean}}
 */
export function evaluar(cmd, ramaActual) {
  if (!/\bgit\b/.test(cmd)) return { accion: 'permitir', esCommit: false };

  if (esDestructivoSobreMain(cmd, ramaActual)) {
    return { accion: 'bloquear-destructivo', esCommit: false };
  }

  const esCommit = /git commit\b/.test(cmd) && ramaActual === RAMA_PROTEGIDA;
  const esMerge = /git merge\b/.test(cmd) && ramaActual === RAMA_PROTEGIDA;

  if (esCommit || esMerge || pushTocaMain(cmd, ramaActual)) {
    return { accion: 'exigir-autorizacion', esCommit };
  }

  return { accion: 'permitir', esCommit: false };
}
