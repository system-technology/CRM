#!/usr/bin/env node
// Comprueba que un PR respeta su carril según ownership.json.
//
//   node scripts/check-ownership.mjs [--base origin/main] [--branch <rama>] [--lane a|b|i]
//
// Carril: --lane, env LANE, o prefijo de rama (a/…, b/…, i/…, o lane-a|lane-b heredado).
// Sin carril reconocible solo informa (no falla). OVERRIDE=1 (etiqueta `override-lane`)
// convierte el fallo en aviso. Salida 1 = el PR toca rutas de otro carril.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};
const git = (a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const base = arg('--base', 'origin/main');
const branch = arg('--branch', process.env.BRANCH || git(['branch', '--show-current']));
const own = JSON.parse(readFileSync(new URL('../ownership.json', import.meta.url), 'utf8'));

function toRegex(glob) {
  const s = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*');
  return new RegExp(`^${s}$`);
}
const matchers = (list) => list.map(toRegex);
const any = (ms, f) => ms.some((m) => m.test(f));

const m = /^(a|b|i)\//.exec(branch) || /lane-(a|b)\b/.exec(branch);
const lane = arg('--lane', process.env.LANE) || (m ? m[1] : null);
const files = git(['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean);

const lanes = Object.fromEntries(Object.entries(own.lanes).map(([k, v]) => [k, matchers(v.owns)]));
const shared = matchers(own.shared);
const human = matchers(own.humanRequired);

const foreign = [];
const needsHuman = [];
for (const f of files) {
  if (any(human, f)) needsHuman.push(f);
  if (any(shared, f)) continue;
  const owner = Object.keys(lanes).find((k) => any(lanes[k], f));
  if (lane && owner && owner !== lane) foreign.push(`${f}  (carril ${owner})`);
}

console.log(`rama: ${branch || '(?)'}  carril: ${lane || 'desconocido'}  ficheros: ${files.length}`);
if (needsHuman.length) console.log(`\n⚠ Requieren revisión humana (CODEOWNERS):\n  ${needsHuman.join('\n  ')}`);
if (!lane) {
  console.log('\nℹ Carril no reconocible: nombra la rama a/…, b/… o i/… para activar la comprobación.');
  process.exit(0);
}
if (foreign.length) {
  console.log(`\n✗ El carril ${lane} toca rutas de otro carril:\n  ${foreign.join('\n  ')}`);
  if (process.env.OVERRIDE === '1') {
    console.log('\n(OVERRIDE activo: se acepta con aviso)');
    process.exit(0);
  }
  console.log('\nSepara el cambio en un PR del carril dueño, o pide la etiqueta `override-lane` al integrador.');
  process.exit(1);
}
console.log('\n✔ Dentro del carril.');
