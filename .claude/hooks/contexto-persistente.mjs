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
 *
 * Modos (primer argumento):
 *   inicio      SessionStart: inyecta checkpoint + últimas entradas del diario.
 *   compactar   PreCompact: ordena que el resumen apunte a estos archivos y no los sustituya.
 *   parada      Stop: avisa si el checkpoint está viejo respecto al trabajo reciente. No bloquea.
 *
 * Nunca lanza: un hook roto no puede impedir trabajar.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MAX_LINEAS_CHECKPOINT = 220;
const MAX_LINEAS_DIARIO = 70;
const HORAS_CHECKPOINT_VIEJO = 3;

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
    if (marco) partes.push(`## MARCO DE TRABAJO

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
    if (diario) {
      partes.push(`## DIARIO (versionado, lo más reciente primero)\n\n${diario}`);
    }
    partes.push(
      'Archivos: `docs/_contexto/CHECKPOINT.local.md` (escribir ahí tras cada hito, sin PR), ' +
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
        '(local) y `docs/_contexto/DIARIO.md` (git). Incluye en el resumen: (1) la orden "al retomar, lee ambos ' +
        'archivos y verifica con gh/git antes de afirmar nada"; (2) la última petición literal del usuario y si ' +
        'quedó sin responder; (3) lo que se prometió hacer y aún no se hizo, sin darlo por hecho; (4) qué es ' +
        'verificado y qué es supuesto.\n',
    );
  } else if (modo === 'parada') {
    const h = horasDesde(rutaCheckpoint);
    const hayTrabajo =
      (git(['status', '--porcelain']) ?? '') !== '' ||
      (git(['log', '-1', '--since=3.hours', '--format=%h']) ?? '') !== '';
    if (hayTrabajo && (h === null || h > HORAS_CHECKPOINT_VIEJO)) {
      process.stderr.write(
        `Hubo trabajo reciente pero \`docs/_contexto/CHECKPOINT.local.md\` ${h === null ? 'no existe' : `lleva ${Math.round(h)} h sin tocarse`}. ` +
          'Antes de que la sesión se compacte, escribe ahí el estado vivo (PRs en cola, lo prometido y pendiente, ' +
          'trampas del momento). Es local y no necesita PR.\n',
      );
    }
  }
} catch {
  // Un hook de contexto jamás debe romper la sesión.
}

process.exit(0);
