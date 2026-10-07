#!/usr/bin/env node
/**
 * Hook Stop — avisa si la sesión modificó el proyecto pero no actualizó el hilo.
 *
 * Por qué existe: el modo más común de perder el hilo es terminar una sesión productiva sin dejar
 * constancia. Este hook compara si hubo cambios en el repositorio contra si ESTADO.md fue tocado.
 *
 * No bloquea: avisa. Un recordatorio que impide cerrar la sesión termina deshabilitado.
 */

import { execFileSync } from 'node:child_process';

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

const estadoGit = git(['status', '--porcelain']);
if (estadoGit === null) process.exit(0); // Sin git no hay nada que comparar.

const archivosTocados = estadoGit
  .split('\n')
  .filter(Boolean)
  .map((l) => l.slice(3).trim());

if (archivosTocados.length === 0) process.exit(0); // Sesión sin cambios: nada que registrar.

const tocoEstado = archivosTocados.some((f) => f === 'ESTADO.md');
const tocoBitacora = archivosTocados.some((f) => f.startsWith('docs/_bitacora/'));

// Cambios que no mueven el hilo: formateo, bloqueos de dependencias, la propia bitácora.
const soloRuido = archivosTocados.every((f) =>
  /^(pnpm-lock\.yaml|package-lock\.json|docs\/_bitacora\/|ESTADO\.md)/.test(f),
);

if (soloRuido || (tocoEstado && tocoBitacora)) process.exit(0);

const faltantes = [];
if (!tocoEstado) faltantes.push('`ESTADO.md` (dónde estamos, qué sigue, qué bloquea)');
if (!tocoBitacora) faltantes.push('una entrada en `docs/_bitacora/`');

process.stderr.write(
  `Esta sesión modificó ${archivosTocados.length} archivo(s) pero no actualizó ${faltantes.join(' ni ')}.\n` +
    'El hilo del proyecto vive en esos archivos: lo que no quede escrito ahí, se pierde en la ' +
    'próxima sesión. Ejecuta `/estado` para cerrarla correctamente.\n',
);

process.exit(0);
