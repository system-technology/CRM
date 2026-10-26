import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as R from './roadmap.mjs';

const temporal = (nombre) => join(tmpdir(), `roadmap-${nombre}-${process.pid}.yaml`);

const fixture = () => ({
  meta: { current_phase: 1, cycle_counter: 0, phases: { 1: 'uno' } },
  tasks: [
    {
      id: 'T-001',
      title: 'a',
      type: 'infra',
      phase: 1,
      priority: 'P1',
      effort: 'S',
      status: 'done',
      acceptance: ['x'],
    },
    {
      id: 'T-002',
      title: 'b',
      type: 'test',
      phase: 1,
      priority: 'P0',
      effort: 'M',
      status: 'backlog',
      depends_on: ['T-001'],
      acceptance: ['x'],
    },
    {
      id: 'T-003',
      title: 'c',
      type: 'feature',
      phase: 1,
      priority: 'P0',
      effort: 'S',
      status: 'backlog',
      depends_on: ['T-002'],
      acceptance: ['x'],
    },
    {
      id: 'T-004',
      title: 'd',
      type: 'refactor',
      phase: 1,
      priority: 'P2',
      effort: 'L',
      status: 'ready',
      acceptance: ['x'],
    },
  ],
});

test('validate: fixture válido', () => assert.deepEqual(R.validate(fixture()), []));
test('next_task respeta dependencias y prioridad', () =>
  assert.equal(R.nextTask(fixture()).task.id, 'T-002'));
test('next_task nunca elige L', () => {
  const d = fixture();
  d.tasks[1].status = 'done';
  d.tasks[2].status = 'done';
  assert.equal(R.nextTask(d).task, null);
});
test('start/complete exige evidencia y una sola in_progress', () => {
  const d = fixture();
  R.startTask(d, 'T-002', 1);
  assert.throws(() => R.startTask(d, 'T-004', 1), /in_progress/);
  assert.throws(() => R.completeTask(d, 'T-002', { evidence: 'ok' }), /evidence/);
  R.completeTask(d, 'T-002', { evidence: 'scripts/check.sh: ✔ Todo en verde. 108 tests passed' });
  assert.equal(d.tasks[1].status, 'done');
  assert.equal(R.nextTask(d).task.id, 'T-003');
});
test('add_task valida y asigna id', () => {
  const d = fixture();
  const t = R.addTask(d, { title: 'n', type: 'bug', acceptance: ['y'] });
  assert.equal(t.id, 'T-005');
  assert.throws(() => R.addTask(d, { title: 'z', type: 'bug', acceptance: [] }));
});
test('split_task encadena partes y dropea la original', () => {
  const d = fixture();
  const parts = R.splitTask(d, 'T-004', [
    { title: 'p1', acceptance: ['a'] },
    { title: 'p2', acceptance: ['b'] },
  ]);
  assert.equal(d.tasks[3].status, 'dropped');
  assert.deepEqual(parts[1].depends_on, [parts[0].id]);
});

test('ultimos_ciclos: normaliza el encabezado y no duplica "## ##"', () => {
  const bitacora = [
    '# Bitacora',
    '',
    '## Ciclo 4 - 2026-10-21T00:43:38.664Z',
    '- **Tarea:** T-014',
    '---',
    '',
    '## ## Ciclo 5 - 2026-10-21T02:36:45.758Z',
    '- **Tarea:** T-015',
    '---',
  ].join('\n');
  const out = R.ultimosCiclos(bitacora);
  assert.ok(out.includes('## Ciclo 5'));
  assert.ok(!out.includes('## ##'));
  assert.ok(!out.includes('# Bitacora'));
  assert.ok(!out.includes('---'));
});

test('ultimos_ciclos: cada ciclo conserva su encabezado y su cuerpo', () => {
  const bitacora = [
    '## Ciclo 1 - d',
    'cuerpo 1',
    '---',
    '',
    '## Ciclo 2 - d',
    'cuerpo 2',
    '---',
  ].join('\n');
  const out = R.ultimosCiclos(bitacora);
  assert.match(out, /## Ciclo 1/);
  assert.match(out, /## Ciclo 2/);
  assert.match(out, /cuerpo 1/);
  assert.match(out, /cuerpo 2/);
});

test('ultimos_ciclos: recorta los ciclos largos y marca el corte', () => {
  const largo = Array.from({ length: 30 }, (_, i) => `linea ${i}`).join('\n');
  const out = R.ultimosCiclos(`## Ciclo 1 - d\n${largo}`, 3, 5);
  assert.ok(out.includes('…'));
  assert.ok(!out.includes('linea 29'));
});

test('save es idempotente sobre el tasks.yaml real (no reformatea en masa)', () => {
  const tmp = temporal('idem');
  copyFileSync(R.PATHS.tasks, tmp);
  try {
    const store = R.load(tmp);
    R.save(store, tmp);
    assert.equal(readFileSync(tmp, 'utf8'), readFileSync(R.PATHS.tasks, 'utf8'));
  } finally {
    rmSync(tmp, { force: true });
  }
});

test('save solo toca las claves que cambian', () => {
  const tmp = temporal('minimo');
  copyFileSync(R.PATHS.tasks, tmp);
  try {
    const store = R.load(tmp);
    store.data.tasks[0].status = 'in_progress';
    R.save(store, tmp);
    const antes = readFileSync(R.PATHS.tasks, 'utf8').split('\n');
    const despues = readFileSync(tmp, 'utf8').split('\n');
    const distintas = antes.filter((linea, i) => linea !== despues[i]);
    assert.equal(distintas.length, 1, 'solo debe cambiar la línea del status');
  } finally {
    rmSync(tmp, { force: true });
  }
});
