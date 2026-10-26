/**
 * Ubicacion del marcador de autorizacion de integracion.
 *
 * Antes era la ruta fija `.git/INTEGRACION-AUTORIZADA`. En un worktree `.git` es un ARCHIVO
 * (apunta al directorio real), asi que `autorizar-integracion` fallaba con ENOTDIR, y el guardia
 * buscaba el marcador relativo a SU directorio y no al del comando.
 *
 * Se usa `git rev-parse --absolute-git-dir`: el directorio git PROPIO de cada worktree
 * (`<repo>/.git/worktrees/<nombre>`), no el comun. Decision: una autorizacion pedida desde un
 * worktree no debe servir a otro que no la pidio; con `--git-common-dir` sirviria a todos.
 * En el repo principal coincide con `.git`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const NOMBRE_MARCADOR = 'INTEGRACION-AUTORIZADA';

/** Ruta absoluta del marcador para el repositorio/worktree en `cwd`, o `null` si no es un repo. */
export function rutaMarcador(cwd) {
  try {
    const dir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(cwd ? { cwd } : {}),
    }).trim();
    return dir ? join(dir, NOMBRE_MARCADOR) : null;
  } catch {
    return null;
  }
}
