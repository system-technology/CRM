#!/usr/bin/env node
/**
 * Hook PreToolUse (Bash) — protege la rama principal.
 *
 * Regla R11 de CLAUDE.md: en `main` solo escribe el agente `integrador`, y solo después de
 * superar todas las compuertas. Todo lo demás ocurre en ramas de trabajo.
 *
 * Qué impide:
 *   1. Reescribir el historial de `main` (`push --force`, `reset --hard`, borrado forzado).
 *      Siempre, haya o no autorización. No existe caso legítimo.
 *   2. Commit, merge o push que escriba en `main` sin autorización vigente del integrador.
 *
 * Cómo se autoriza una integración:
 *   node .claude/hooks/autorizar-integracion.mjs "<motivo>"
 * La autorización es de un solo uso y caduca a los 30 minutos.
 *
 * La decisión vive en lib/politica-rama.mjs, que es lógica pura y está cubierta por
 * lib/politica-rama.test.mjs. Este archivo solo lee el estado real y aplica el veredicto.
 *
 * ALCANCE HONESTO: esto es una barandilla local contra el accidente, no una frontera de
 * seguridad. Un agente decidido puede crear el marcador. La protección real es la de servidor
 * (GitHub branch protection). Ver docs/07-ingenieria/03-git.md §6.
 */

import { readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  directorioDelComando,
  evaluar,
  RAMA_PROTEGIDA,
  rutaDeSistema,
} from './lib/politica-rama.mjs';

const MARCADOR = '.git/INTEGRACION-AUTORIZADA';
const VIGENCIA_MS = 30 * 60 * 1000;

function bloquear(motivo) {
  process.stderr.write(motivo);
  process.exit(2);
}

let datos;
try {
  datos = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // Un hook roto no puede frenar el trabajo.
}

const comando = datos.tool_input?.command;
if (typeof comando !== 'string') process.exit(0);

// La rama se averigua en el directorio sobre el que ACTÚA el comando, no en el de la sesión.
// Con un solo árbol de trabajo da igual; con worktrees —varias carpetas del mismo repositorio,
// cada una en su rama— no, y falla en los dos sentidos. El peligroso es el falso negativo: si
// la sesión está en una rama de trabajo y el comando entra con `cd` en un worktree que tiene
// `main`, mirar la rama de la sesión deja pasar la escritura en la rama protegida.
const directorio = rutaDeSistema(directorioDelComando(comando), process.platform === 'win32');

let ramaActual;
try {
  ramaActual = execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    timeout: 10_000,
    ...(directorio ? { cwd: directorio } : {}),
  }).trim();
} catch {
  // Si el `cd` apuntaba a algo que no es un repositorio, se reintenta en el de la sesión antes
  // de rendirse: quedarse sin rama significa no proteger nada.
  if (!directorio) process.exit(0);
  try {
    ramaActual = execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
  } catch {
    process.exit(0);
  }
}

// Se pasa el comando CRUDO: la política lo tokeniza respetando comillas y heredocs.
// Normalizar los espacios aquí destruiría los saltos de línea que delimitan un heredoc.
const { accion, esCommit } = evaluar(comando, ramaActual);

if (accion === 'permitir') process.exit(0);

if (accion === 'bloquear-destructivo') {
  bloquear(
    `Bloqueado: operación destructiva sobre '${RAMA_PROTEGIDA}'.\n\n` +
      'Reescribir el historial de la rama principal rompe el repositorio de todos los demás y\n' +
      'destruye la trazabilidad de los releases. No hay caso de uso legítimo para esto aquí.\n\n' +
      'Si hay que deshacer algo que ya está en main, se hace con `git revert`, que deja constancia.',
  );
}

// accion === 'exigir-autorizacion'
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

process.exit(0);
