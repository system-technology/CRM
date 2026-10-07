#!/usr/bin/env node
/**
 * Autoriza una integración a la rama principal. Lo ejecuta el agente `integrador`,
 * y solo después de haber superado TODAS las compuertas de su procedimiento.
 *
 *   node .claude/hooks/autorizar-integracion.mjs "<motivo de la integración>"
 *
 * Crea un marcador de un solo uso, válido 30 minutos, que el hook `guard-rama` consume.
 * Además deja constancia en docs/_integraciones/ — la autorización es auditable, no silenciosa.
 */

import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MARCADOR = '.git/INTEGRACION-AUTORIZADA';
const REGISTRO = 'docs/_integraciones/registro-de-autorizaciones.log';

const motivo = process.argv.slice(2).join(' ').trim();

if (!motivo) {
  process.stderr.write(
    'Falta el motivo de la integración.\n\n' +
      '  node .claude/hooks/autorizar-integracion.mjs "feat/inbox-webhooks → main, v0.2.0"\n\n' +
      'El motivo queda registrado. Una autorización sin explicación no sirve para auditar nada.\n',
  );
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return '(desconocido)';
  }
}

const rama = git(['branch', '--show-current']);
const commit = git(['rev-parse', '--short', 'HEAD']);
const ahora = new Date().toISOString();

// El marcador lleva contexto: si algo sale mal, se sabe qué se autorizó y desde dónde.
writeFileSync(
  MARCADOR,
  JSON.stringify({ motivo, rama, commit, autorizadoEn: ahora, vigenciaMinutos: 30 }, null, 2),
  'utf8',
);

if (!existsSync('docs/_integraciones')) mkdirSync('docs/_integraciones', { recursive: true });
appendFileSync(REGISTRO, `${ahora}\t${rama}\t${commit}\t${motivo}\n`, 'utf8');

process.stdout.write(
  `Integración autorizada.\n` +
    `  Motivo:  ${motivo}\n` +
    `  Rama:    ${rama} (${commit})\n` +
    `  Vigencia: 30 minutos, un solo uso.\n\n` +
    `Registrado en ${REGISTRO}.\n`,
);
