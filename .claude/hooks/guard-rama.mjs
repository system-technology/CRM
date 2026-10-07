#!/usr/bin/env node
/**
 * Hook PreToolUse (Bash) — protege la rama principal.
 *
 * Regla R11 de CLAUDE.md: en `main` solo escribe el agente `integrador`, y solo después de
 * superar todas las compuertas. Todo lo demás ocurre en ramas de trabajo.
 *
 * Qué impide:
 *   1. `git commit` estando en `main`.
 *   2. `git merge` o `git push` hacia `main` sin autorización previa del integrador.
 *   3. `git push --force` o `git reset --hard` sobre `main`, siempre. Sin excepción.
 *
 * Cómo se autoriza una integración:
 *   node .claude/hooks/autorizar-integracion.mjs "<motivo>"
 * La autorización es de un solo uso y caduca a los 30 minutos.
 *
 * ALCANCE HONESTO: esto es una barandilla local contra el accidente, no una frontera de
 * seguridad. Un agente decidido puede crear el marcador. La protección real para un equipo es
 * la de servidor (GitHub branch protection). Ver docs/07-ingenieria/03-git.md §6.
 *
 * Protocolo: para bloquear, salir con código 2 y escribir el motivo en stderr.
 */

import { readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RAMA_PROTEGIDA = 'main';
const MARCADOR = '.git/INTEGRACION-AUTORIZADA';
const VIGENCIA_MS = 30 * 60 * 1000;

function bloquear(motivo) {
  process.stderr.write(motivo);
  process.exit(2);
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

let datos;
try {
  datos = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // Un hook roto no puede frenar el trabajo.
}

const comando = datos.tool_input?.command;
if (typeof comando !== 'string' || !/\bgit\b/.test(comando)) process.exit(0);

const ramaActual = git(['branch', '--show-current']);
if (ramaActual === null) process.exit(0); // Sin repositorio git no hay nada que proteger.

// Normaliza para analizar: una línea, sin espacios repetidos.
const cmd = comando.replace(/\s+/g, ' ').trim();

// --- 1. Operaciones destructivas sobre main: prohibidas siempre -------------
const esDestructivo =
  /git push\b.*(--force\b|--force-with-lease\b|-f\b)/.test(cmd) ||
  /git reset\b.*--hard/.test(cmd) ||
  /git branch\b.*(-D|--delete --force)\s+main\b/.test(cmd);

if (esDestructivo && (ramaActual === RAMA_PROTEGIDA || /\bmain\b/.test(cmd))) {
  bloquear(
    `Bloqueado: operación destructiva sobre '${RAMA_PROTEGIDA}'.\n\n` +
      'Reescribir el historial de la rama principal rompe el repositorio de todos los demás y\n' +
      'destruye la trazabilidad de los releases. No hay caso de uso legítimo para esto aquí.\n\n' +
      'Si hay que deshacer algo que ya está en main, se hace con `git revert`, que deja constancia.',
  );
}

// --- 2. Cualquier escritura sobre main exige autorización del integrador ---
// Una sola puerta para todo lo que modifica la rama principal: commit, merge y push.
// La autorización la emite el integrador tras superar sus siete compuertas, es de un solo uso,
// caduca a los 30 minutos y queda registrada. También cubre el commit de génesis del repositorio.
const esCommit = /git commit\b/.test(cmd) && ramaActual === RAMA_PROTEGIDA;
const esMerge = /git merge\b/.test(cmd) && ramaActual === RAMA_PROTEGIDA;
const esPush =
  /git push\b[^|&;]*\bmain\b/.test(cmd) ||
  (/git push\b/.test(cmd) && ramaActual === RAMA_PROTEGIDA);

const escribeEnMain = esCommit || esMerge || esPush;

if (escribeEnMain) {
  let autorizado = false;
  let motivoFallo = 'no hay autorización vigente';

  if (existsSync(MARCADOR)) {
    const edad = Date.now() - statSync(MARCADOR).mtimeMs;
    if (edad <= VIGENCIA_MS) {
      autorizado = true;
    } else {
      motivoFallo = `la autorización caducó hace ${Math.round((edad - VIGENCIA_MS) / 60000)} min`;
      try {
        unlinkSync(MARCADOR);
      } catch {
        /* da igual: ya está caducada */
      }
    }
  }

  if (!autorizado) {
    const consejoCommit = esCommit
      ? '\nSi lo que ibas a hacer es trabajar, no integrar, estás en la rama equivocada:\n' +
        '  git checkout -b feat/<contexto>-<descripcion>\n' +
        '  git commit -m "feat(<scope>): ..."\n' +
        'Y cuando esté lista, /integrar.\n'
      : '';

    bloquear(
      `Bloqueado: escritura en '${RAMA_PROTEGIDA}' sin autorización (${motivoFallo}).\n\n` +
        'Regla R11 de CLAUDE.md: en main solo escribe el agente `integrador`, y solo tras\n' +
        'verificar typecheck, lint, test, build, aislamiento entre tenants, ausencia de secretos,\n' +
        'fronteras entre módulos, auditorías aplicables y coherencia del hilo documental.\n' +
        consejoCommit +
        '\nSi eres el integrador y ya corriste todas las compuertas:\n' +
        '  node .claude/hooks/autorizar-integracion.mjs "<motivo de la integración>"\n\n' +
        'La autorización es de un solo uso y vale 30 minutos.',
    );
  }

  // Autorización de un solo uso: se consume al permitir la operación.
  try {
    unlinkSync(MARCADOR);
  } catch {
    /* si no se puede borrar, caducará sola */
  }
}

process.exit(0);
