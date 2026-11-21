#!/usr/bin/env node
/**
 * Hook de contexto persistente — el "cerebro" que sobrevive a la compactación y a las sesiones.
 *
 * Dos capas, ambas en `docs/_contexto/` del checkout principal (también cuando se corre desde un
 * worktree, porque se resuelve con `git rev-parse --git-common-dir`):
 *
 *   CHECKPOINT.local.md  Local, ignorado por git. Se escribe en cualquier momento, sin PR. Es lo
 *                        que se lee primero al retomar: estado vivo, cola, trampas del momento.
 *   DIARIO.md            En git. Versión consolidada (decisiones, hitos), entra por lote de la
 *                        carril `i/`. Sobrevive a un clon nuevo o a un Codespace.
 *   TABLERO-DEL-ORQUESTADOR.md  En git. El estado vivo de la orquestación (sesiones, cola de
 *                        integración, ids reservados, pendientes). Lo alimenta la sesión madre en cada
 *                        hito y se empuja a su rama; en un clon nuevo se lee de esa rama si es más nuevo.
 *
 * Modos (primer argumento):
 *   inicio      SessionStart: inyecta checkpoint + últimas entradas del diario.
 *   compactar   PreCompact: ordena que el resumen apunte a estos archivos y no los sustituya.
 *   parada      Stop: si el checkpoint es más viejo que el último commit (o que 2 h con el árbol
 *               sucio), BLOQUEA la parada una vez y ordena escribirlo. El aviso por stderr con
 *               salida 0 no lo ve el modelo: por eso es `decision: block`. `stop_hook_active`
 *               evita el bucle (la segunda parada seguida siempre pasa).
 *   hito        PostToolUse de merge/PR/push: recuerda en el acto actualizar el checkpoint.
 *
 * Nunca lanza: un hook roto no puede impedir trabajar.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

function leerEntrada() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}
import { dirname, join, resolve } from 'node:path';

const MAX_LINEAS_CHECKPOINT = 220;
const MAX_LINEAS_DIARIO = 70;
const MAX_LINEAS_TABLERO = 140;
/** Rama donde la sesión madre empuja el tablero entre PR de docs. */
const RAMA_DEL_TABLERO = 'origin/claude/repository-status-d4ug6p';
const HORAS_CHECKPOINT_VIEJO = 2;
/** Holgura entre el último commit y el checkpoint antes de exigir reescribirlo. */
const MINUTOS_HOLGURA = 10;

function git(args, cwd) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', timeout: 8_000, cwd }).trim();
  } catch {
    return null;
  }
}

/** Raíz del checkout principal, aunque se corra dentro de un worktree. */
function raizPrincipal() {
  const comun = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (comun) return dirname(resolve(comun));
  return process.cwd();
}

const raiz = raizPrincipal();
const dirContexto = join(raiz, 'docs', '_contexto');
const rutaCheckpoint = join(dirContexto, 'CHECKPOINT.local.md');
const rutaDiario = join(dirContexto, 'DIARIO.md');
const rutaTablero = join(dirContexto, 'TABLERO-DEL-ORQUESTADOR.md');
const rutaMarco = join(dirContexto, 'MARCO.md');

function leer(ruta, maxLineas, desdeElFinal = false) {
  try {
    if (!existsSync(ruta)) return null;
    const lineas = readFileSync(ruta, 'utf8').split('\n');
    if (lineas.length <= maxLineas) return lineas.join('\n');
    const recorte = desdeElFinal ? lineas.slice(-maxLineas) : lineas.slice(0, maxLineas);
    return recorte.join('\n') + '\n… (recortado; léelo completo si lo necesitas)';
  } catch {
    return null;
  }
}

/** Fecha del último commit que tocó el tablero en una referencia; 0 si no existe allí. */
function fechaDelTableroEn(ref) {
  const salida = git(['log', '-1', '--format=%ct', ref, '--', 'docs/_contexto/TABLERO-DEL-ORQUESTADOR.md']);
  return salida ? Number.parseInt(salida.trim(), 10) || 0 : 0;
}

function recortar(texto) {
  const lineas = texto.split('\n');
  return lineas.length <= MAX_LINEAS_TABLERO ? texto : lineas.slice(0, MAX_LINEAS_TABLERO).join('\n') + '\n… (recortado)';
}

/**
 * Tablero: el más reciente entre el del checkout y el de la rama de la sesión madre.
 *
 * Antes se prefería siempre la rama. Al integrarse el tablero en `main` por squash, esa rama se
 * queda atrás y seguía ganando: las sesiones leían un tablero viejo. Ahora gana la fecha.
 */
function leerTablero() {
  const local = leer(rutaTablero, MAX_LINEAS_TABLERO);
  const fechaLocal = fechaDelTableroEn('HEAD');
  const fechaRama = fechaDelTableroEn(RAMA_DEL_TABLERO);
  if (fechaRama > fechaLocal) {
    const enRama = git(['show', `${RAMA_DEL_TABLERO}:docs/_contexto/TABLERO-DEL-ORQUESTADOR.md`]);
    if (enRama) return { texto: recortar(enRama), origen: `rama ${RAMA_DEL_TABLERO}` };
  }
  return local ? { texto: local, origen: 'checkout' } : null;
}

function horasDesde(ruta) {
  try {
    return (Date.now() - statSync(ruta).mtimeMs) / 3_600_000;
  } catch {
    return null;
  }
}

const modo = process.argv[2];

try {
  if (modo === 'inicio') {
    const partes = ['# Cerebro persistente de ViajaPro (inyectado al iniciar la sesión)'];
    const checkpoint = leer(rutaCheckpoint, MAX_LINEAS_CHECKPOINT);
    const diario = leer(rutaDiario, MAX_LINEAS_DIARIO);
    const marco = leer(rutaMarco, 120);
    const tablero = leerTablero();
    if (marco)
      partes.push(`## MARCO DE TRABAJO

${marco}`);
    if (checkpoint) {
      const h = horasDesde(rutaCheckpoint);
      partes.push(
        `## CHECKPOINT local (hace ${h === null ? '?' : Math.round(h)} h)\n` +
          'Estado vivo escrito por la sesión anterior. Verifícalo contra `gh` y `git` antes de afirmarlo.\n\n' +
          checkpoint,
      );
    } else {
      partes.push(
        'No hay `docs/_contexto/CHECKPOINT.local.md` (clon nuevo o nunca se escribió). Reconstruye desde ' +
          '`docs/_contexto/DIARIO.md`, `ESTADO.md` y `gh pr list`.',
      );
    }
    if (tablero) {
      partes.push(
        `## TABLERO DEL ORQUESTADOR (versionado; leído de: ${tablero.origen})\n` +
          'Estado vivo de la orquestación. Verifícalo contra `gh` y `git` antes de afirmarlo y corrígelo si miente.\n\n' +
          tablero.texto,
      );
    }
    if (diario) {
      partes.push(`## DIARIO (versionado, lo más reciente primero)\n\n${diario}`);
    }
    partes.push(
      'Archivos: `docs/_contexto/CHECKPOINT.local.md` (escribir ahí tras cada hito, sin PR), ' +
        '`docs/_contexto/TABLERO-DEL-ORQUESTADOR.md` (versionado: la sesión madre lo actualiza y empuja tras cada hito), ' +
        '`docs/_contexto/DIARIO.md` (consolidar por lote de la carril `i/`), `docs/_contexto/CONTEXTO.md` (lo estable).',
    );
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: partes.join('\n\n'),
        },
      }),
    );
  } else if (modo === 'compactar') {
    // En PreCompact, la salida estándar se añade a las instrucciones de compactación.
    process.stdout.write(
      'Al resumir: el estado persistente NO vive en este resumen sino en `docs/_contexto/CHECKPOINT.local.md` ' +
        '(local), `docs/_contexto/TABLERO-DEL-ORQUESTADOR.md` y `docs/_contexto/DIARIO.md` (git). Incluye en el resumen: (1) la orden "al retomar, lee ambos ' +
        'archivos y verifica con gh/git antes de afirmar nada"; (2) la última petición literal del usuario y si ' +
        'quedó sin responder; (3) lo que se prometió hacer y aún no se hizo, sin darlo por hecho; (4) qué es ' +
        'verificado y qué es supuesto.\n',
    );
  } else if (modo === 'parada') {
    const entrada = leerEntrada();
    if (entrada.stop_hook_active) process.exit(0);
    const h = horasDesde(rutaCheckpoint);
    const segCommit = Number(git(['log', '-1', '--format=%ct']) ?? 0);
    const horasCommit = segCommit ? (Date.now() / 1000 - segCommit) / 3600 : null;
    const sucio = (git(['status', '--porcelain']) ?? '') !== '';
    let motivo = null;
    if (h === null) {
      if (sucio || (horasCommit !== null && horasCommit < 3)) motivo = 'no existe';
    } else if (horasCommit !== null && horasCommit + MINUTOS_HOLGURA / 60 < h) {
      motivo = `es anterior al último commit (${Math.round(h * 60)} min frente a ${Math.round(horasCommit * 60)} min)`;
    } else if (sucio && h > HORAS_CHECKPOINT_VIEJO) {
      motivo = `lleva ${Math.round(h)} h sin tocarse con cambios en el árbol`;
    }
    if (motivo) {
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason:
            `El cerebro está desactualizado: \`docs/_contexto/CHECKPOINT.local.md\` ${motivo}. ` +
            'Antes de terminar, actualízalo: PRs y su estado verificado, lo prometido y pendiente, lo que hay ' +
            'sin commit, trampas nuevas. Es local, sin PR. Si cerraste un lote, añade también la entrada en DIARIO.md.',
        }),
      );
    }
  } else if (modo === 'hito') {
    const entrada = leerEntrada();
    const herramienta = String(entrada.tool_name ?? '');
    const comando = String(entrada.tool_input?.command ?? '');
    const esHito =
      /merge_pull_request|create_pull_request/.test(herramienta) ||
      (herramienta === 'Bash' && /\bgit (push|merge)\b|\bgh pr (create|merge)\b/.test(comando));
    if (esHito) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext:
              'Hito (PR, merge o push): actualiza ahora `docs/_contexto/CHECKPOINT.local.md` con el estado ' +
              'verificado y, si eres la sesión madre, `docs/_contexto/TABLERO-DEL-ORQUESTADOR.md` (versionado: ' +
              'cola, ventanas, ids, pendientes) y empújalo a tu rama, antes de seguir con lo siguiente.',
          },
        }),
      );
    }
  }
} catch {
  // Un hook de contexto jamás debe romper la sesión.
}

process.exit(0);
