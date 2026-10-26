#!/usr/bin/env node
// Marca como hecha en roadmap/tasks.yaml la tarea que indica la RAMA de un PR mergeado.
//
//   node scripts/cerrar-tarea.mjs --rama b/T-054-borrado --pr 93 --sha <merge-commit>
//
// Solo cuenta la rama (a|b|i/T-xxx-slug), nunca el título. Es idempotente: si la tarea ya está hecha,
// descartada o no existe, no cambia nada. No regenera STATE.md (es derivado; el estado real lo da
// scripts/board.mjs) para que dos cierres seguidos no choquen. Lo usa .github/workflows/cerrar-tarea.yml.
import { appendFileSync } from 'node:fs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const rama = arg('--rama');
const pr = arg('--pr');
const sha = arg('--sha');

const m = /^(a|b|i)\/(T-\d{3})-/.exec(rama);
if (!m) { console.log(`La rama «${rama}» no sigue a|b|i/T-xxx-slug: no se cierra ninguna tarea.`); process.exit(0); }
const id = m[2];

const R = await import(new URL('../tools/roadmap-mcp/roadmap.mjs', import.meta.url).href);
const store = R.load();
const t = store.data.tasks.find((x) => x.id === id);
if (!t) { console.log(`${id} no existe en tasks.yaml: nada que cerrar.`); process.exit(0); }
if (['done', 'dropped'].includes(t.status)) { console.log(`${id} ya está ${t.status}: nada que hacer.`); process.exit(0); }

t.status = 'in_progress'; // el trabajo ya está mergeado: se salta la comprobación de dependencias y del «una a la vez»
t.started_at = t.started_at ?? new Date().toISOString();
R.completeTask(store.data, id, {
  evidence: `Mergeado en main por el PR #${pr} (rama ${rama}) con el CI en verde: format, analyze, tests y los demás checks obligatorios. Cierre automático (.github/workflows/cerrar-tarea.yml).`,
  commit: sha || undefined,
});
const errores = R.validate(store.data);
if (errores.length) { console.error('tasks.yaml no valida tras el cierre:\n' + errores.join('\n')); process.exit(1); }
R.save(store);
console.log(`${id} marcada como hecha (PR #${pr}).`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ids=${id}\n`);
