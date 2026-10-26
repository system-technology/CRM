#!/usr/bin/env node
// Tablero derivado: cruza roadmap/tasks.yaml (QUÉ) con los PRs de GitHub (estado real).
// No escribe nada. Uso: node scripts/board.mjs [--all]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../tools/roadmap-mcp/', import.meta.url));
const YAML = require('yaml');
const tasks = YAML.parse(
  readFileSync(new URL('../roadmap/tasks.yaml', import.meta.url), 'utf8'),
).tasks;
const prs = JSON.parse(
  execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      '200',
      '--json',
      'number,title,headRefName,state,isDraft,mergeStateStatus,statusCheckRollup',
    ],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  ),
);

const idsOf = (p) =>
  new Set(`${p.title} ${p.headRefName}`.match(/T-\d{3}/gi)?.map((s) => s.toUpperCase()) ?? []);
const byTask = new Map();
for (const p of prs) for (const id of idsOf(p)) byTask.set(id, [...(byTask.get(id) ?? []), p]);

const checks = (p) => {
  const c = p.statusCheckRollup ?? [];
  if (!c.length) return p.mergeStateStatus === 'DIRTY' ? 'conflicto' : 'sin checks';
  if (c.some((x) => x.conclusion === 'FAILURE')) return 'ROJO';
  return c.every((x) => x.conclusion === 'SUCCESS' || x.conclusion === 'SKIPPED')
    ? 'verde'
    : 'en curso';
};
const real = (t) => {
  const ps = byTask.get(t.id) ?? [];
  if (ps.some((p) => p.state === 'MERGED')) return 'MERGEADA';
  const open = ps.find((p) => p.state === 'OPEN');
  if (open) return open.isDraft ? 'RESERVADA (draft)' : 'EN REVISIÓN';
  return t.status === 'blocked' ? 'BLOQUEADA' : 'libre';
};

const showAll = process.argv.includes('--all');
const rows = tasks
  .map((t) => ({ t, real: real(t), prs: byTask.get(t.id) ?? [] }))
  .filter(
    (r) => showAll || (r.t.status !== 'done' && r.t.status !== 'dropped') || r.real !== 'libre',
  );

console.log(
  `${'TAREA'.padEnd(7)}${'PRIO'.padEnd(5)}${'YAML'.padEnd(12)}${'REAL'.padEnd(20)}PR / checks`,
);
for (const r of rows) {
  const open = r.prs.filter((p) => p.state === 'OPEN');
  const pr = (open.length ? open : r.prs)
    .map((p) => `#${p.number} ${p.state === 'OPEN' ? checks(p) : p.state.toLowerCase()}`)
    .join(', ');
  console.log(
    `${r.t.id.padEnd(7)}${(r.t.priority ?? '').padEnd(5)}${r.t.status.padEnd(12)}${r.real.padEnd(20)}${pr}`,
  );
}
const drift = rows.filter((r) => r.real === 'MERGEADA' && r.t.status !== 'done');
if (drift.length)
  console.log(
    `\n⚠ Desfase: ${drift.map((r) => r.t.id).join(', ')} mergeadas pero el YAML no dice done.`,
  );
const untagged = prs.filter((p) => p.state === 'OPEN' && !idsOf(p).size);
if (untagged.length)
  console.log(
    `⚠ PRs abiertos sin T-xxx en título/rama: ${untagged.map((p) => '#' + p.number).join(', ')}`,
  );
