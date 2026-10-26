// Lógica pura del roadmap (sin MCP) para poder testearla y usarla desde CLI.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const PATHS = {
  tasks: resolve(ROOT, 'roadmap/tasks.yaml'),
  bitacora: resolve(ROOT, 'roadmap/BITACORA.md'),
  state: resolve(ROOT, 'roadmap/STATE.md'),
  audits: resolve(ROOT, 'roadmap/audits'),
};

export const STATUSES = ['backlog', 'ready', 'in_progress', 'review', 'done', 'blocked', 'dropped'];
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
export const EFFORTS = ['S', 'M', 'L'];
export const TYPES = ['security', 'bug', 'refactor', 'test', 'feature', 'docs', 'infra', 'audit'];

export function load(path = PATHS.tasks) {
  const doc = YAML.parseDocument(readFileSync(path, 'utf8'));
  const data = doc.toJS();
  if (!data?.tasks || !Array.isArray(data.tasks))
    throw new Error('tasks.yaml inválido: falta tasks[]');
  return { doc, data };
}

export function save({ doc, data }, path = PATHS.tasks) {
  // Reescribimos el documento preservando comentarios de cabecera.
  const header = readFileSync(path, 'utf8').split('\nmeta:')[0];
  const body = YAML.stringify({ meta: data.meta, tasks: data.tasks }, { lineWidth: 110 });
  writeFileSync(path, `${header}\n${body}`);
}

export function validate(data) {
  const errors = [];
  const ids = new Set();
  for (const t of data.tasks) {
    if (!/^T-\d{3,}$/.test(t.id)) errors.push(`${t.id}: id inválido`);
    if (ids.has(t.id)) errors.push(`${t.id}: id duplicado`);
    ids.add(t.id);
    if (!STATUSES.includes(t.status)) errors.push(`${t.id}: status inválido ${t.status}`);
    if (!PRIORITIES.includes(t.priority)) errors.push(`${t.id}: priority inválida`);
    if (!EFFORTS.includes(t.effort)) errors.push(`${t.id}: effort inválido`);
    if (!TYPES.includes(t.type)) errors.push(`${t.id}: type inválido`);
    if (!Array.isArray(t.acceptance) || t.acceptance.length === 0)
      errors.push(`${t.id}: sin criterios de aceptación`);
    if (t.status === 'blocked' && !t.blocked_reason)
      errors.push(`${t.id}: blocked sin blocked_reason`);
  }
  for (const t of data.tasks)
    for (const d of t.depends_on ?? [])
      if (!ids.has(d)) errors.push(`${t.id}: depende de ${d} que no existe`);
  const inProgress = data.tasks.filter((t) => t.status === 'in_progress');
  if (inProgress.length > 1)
    errors.push(`más de una tarea in_progress: ${inProgress.map((t) => t.id).join(', ')}`);
  return errors;
}

export function nextId(data) {
  const max = data.tasks.reduce((m, t) => Math.max(m, Number(t.id.slice(2))), 0);
  return `T-${String(max + 1).padStart(3, '0')}`;
}

function depsDone(data, t) {
  const byId = Object.fromEntries(data.tasks.map((x) => [x.id, x]));
  return (t.depends_on ?? []).every((d) => byId[d]?.status === 'done');
}

/** Siguiente tarea: in_progress si la hay; si no, la ready/backlog elegible de mayor prioridad y menor esfuerzo. */
export function nextTask(data) {
  const current = data.tasks.find((t) => t.status === 'in_progress');
  if (current) return { task: current, reason: 'ya in_progress' };
  const eligible = data.tasks
    .filter((t) => ['ready', 'backlog'].includes(t.status) && depsDone(data, t) && t.effort !== 'L')
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
        (a.status === 'ready' ? -1 : 1) - (b.status === 'ready' ? -1 : 1) ||
        EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort) ||
        a.id.localeCompare(b.id),
    );
  if (eligible.length === 0) {
    const large = data.tasks.filter(
      (t) => ['ready', 'backlog'].includes(t.status) && depsDone(data, t) && t.effort === 'L',
    );
    if (large.length)
      return {
        task: null,
        reason: `solo quedan tareas L elegibles (${large.map((t) => t.id).join(', ')}): dividirlas con split_task`,
      };
    return {
      task: null,
      reason: 'no hay tareas elegibles (todas done/blocked o con dependencias pendientes)',
    };
  }
  return { task: eligible[0], reason: 'mayor prioridad elegible' };
}

export function startTask(data, id, cycle) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`${id} no existe`);
  if (!['ready', 'backlog', 'review'].includes(t.status))
    throw new Error(`${id} está ${t.status}, no se puede iniciar`);
  if (!depsDone(data, t)) throw new Error(`${id} tiene dependencias sin terminar`);
  if (data.tasks.some((x) => x.status === 'in_progress'))
    throw new Error('ya hay una tarea in_progress; termínala o bloquéala primero');
  t.status = 'in_progress';
  t.started_cycle = cycle;
  t.started_at = new Date().toISOString();
  return t;
}

export function completeTask(data, id, { evidence, commit }) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`${id} no existe`);
  if (t.status !== 'in_progress') throw new Error(`${id} no está in_progress`);
  if (!evidence || evidence.length < 20)
    throw new Error(
      'evidence obligatoria: pega la salida de scripts/check.sh o describe la verificación',
    );
  t.status = 'done';
  t.done_at = new Date().toISOString();
  t.evidence = evidence;
  if (commit) t.commit = commit;
  return t;
}

export function blockTask(data, id, reason) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`${id} no existe`);
  t.status = 'blocked';
  t.blocked_reason = reason;
  return t;
}

export function addTask(data, input) {
  const t = {
    id: nextId(data),
    title: input.title,
    type: input.type,
    phase: input.phase ?? data.meta.current_phase,
    priority: input.priority ?? 'P2',
    effort: input.effort ?? 'M',
    status: input.status ?? 'backlog',
    depends_on: input.depends_on ?? [],
    acceptance: input.acceptance,
    files: input.files ?? [],
    source: input.source ?? 'agent',
    created_at: new Date().toISOString(),
  };
  data.tasks.push(t);
  const errs = validate(data);
  if (errs.length) {
    data.tasks.pop();
    throw new Error(errs.join('; '));
  }
  return t;
}

export function splitTask(data, id, parts) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`${id} no existe`);
  const created = parts.map((p, i) =>
    addTask(data, {
      ...p,
      type: p.type ?? t.type,
      phase: t.phase,
      priority: p.priority ?? t.priority,
      depends_on: i === 0 ? (t.depends_on ?? []) : [],
      source: `split:${id}`,
    }),
  );
  for (let i = 1; i < created.length; i++) created[i].depends_on = [created[i - 1].id];
  t.status = 'dropped';
  t.dropped_reason = `dividida en ${created.map((c) => c.id).join(', ')}`;
  return created;
}

export function logCycle(data, entry) {
  data.meta.cycle_counter = (data.meta.cycle_counter ?? 0) + 1;
  const n = data.meta.cycle_counter;
  const stamp = new Date().toISOString();
  const md = [
    `## Ciclo ${n} — ${stamp}`,
    `- **Tarea:** ${entry.task_id ?? '—'} ${entry.task_title ? `· ${entry.task_title}` : ''}`,
    `- **Resultado:** ${entry.result}`,
    `- **Rama/commit:** ${entry.branch ?? '—'} ${entry.commit ? `@ ${entry.commit}` : ''}`,
    `- **check.sh:** ${entry.check_passed ? '✅ verde' : '❌ rojo'}`,
    `- **Reviewer:** ${entry.review_verdict ?? '—'}`,
    entry.summary ? `\n${entry.summary}\n` : '',
    entry.problems?.length
      ? `**Problemas:**\n${entry.problems.map((p) => `- ${p}`).join('\n')}\n`
      : '',
    entry.decisions?.length
      ? `**Decisiones:**\n${entry.decisions.map((p) => `- ${p}`).join('\n')}\n`
      : '',
    entry.next ? `**Siguiente:** ${entry.next}\n` : '',
    '---',
    '',
  ]
    .filter((l) => l !== undefined)
    .join('\n');
  appendFileSync(PATHS.bitacora, md);
  return n;
}

export function state(data) {
  const byStatus = Object.fromEntries(
    STATUSES.map((s) => [s, data.tasks.filter((t) => t.status === s)]),
  );
  const total = data.tasks.filter((t) => t.status !== 'dropped').length;
  const done = byStatus.done.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const { task: next, reason } = nextTask(data);
  const phases = Object.entries(data.meta.phases ?? {}).map(([k, v]) => {
    const ts = data.tasks.filter((t) => String(t.phase) === k && t.status !== 'dropped');
    const d = ts.filter((t) => t.status === 'done').length;
    return { phase: k, name: v, done: d, total: ts.length };
  });
  return {
    cycle: data.meta.cycle_counter ?? 0,
    current_phase: data.meta.current_phase,
    progress: { done, total, pct },
    phases,
    in_progress: byStatus.in_progress[0] ?? null,
    next: next
      ? { id: next.id, title: next.title, priority: next.priority, effort: next.effort }
      : null,
    next_reason: reason,
    counts: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.length])),
    blocked: byStatus.blocked.map((t) => ({ id: t.id, title: t.title, reason: t.blocked_reason })),
    validation_errors: validate(data),
  };
}

/**
 * Extrae los últimos ciclos de la bitácora.
 *
 * No troceamos por cadenas: se buscan las cabeceras "## Ciclo N" y se toma el
 * cuerpo de cada una hasta la siguiente. Así el encabezado sale siempre una
 * sola vez (nada de "## ## Ciclo N") y ningún ciclo se queda sin cabecera.
 * Tolera bitácoras ya ensuciadas con "## ## Ciclo N" y las normaliza.
 */
export function ultimosCiclos(texto, max = 3, lineasPorCiclo = 10) {
  if (!texto) return '';
  const cabeceras = [...texto.matchAll(/^#{2,}[ \t]*(?:#[ \t]*)*Ciclo[ \t]+\d+.*$/gm)];
  const inicio = Math.max(0, cabeceras.length - max);
  const bloques = [];
  for (let i = inicio; i < cabeceras.length; i++) {
    const desde = cabeceras[i].index;
    const hasta = i + 1 < cabeceras.length ? cabeceras[i + 1].index : texto.length;
    const bruto = texto
      .slice(desde, hasta)
      .trimEnd()
      .replace(/\n+---[ \t]*$/, '')
      .trimEnd();
    const lineas = bruto.split('\n');
    // Normaliza la cabecera: quita todos los '#' iniciales y deja "## Ciclo N".
    lineas[0] = `## ${lineas[0].replace(/^#{2,}[ \t]*(?:#[ \t]*)*/, '')}`;
    const recortado =
      lineas.length > lineasPorCiclo
        ? [...lineas.slice(0, lineasPorCiclo), '…'].join('\n')
        : lineas.join('\n');
    bloques.push(recortado);
  }
  return bloques.join('\n\n');
}

export function renderState(data) {
  const s = state(data);
  const bar = (d, t) => `${'█'.repeat(Math.round((t ? d / t : 0) * 20)).padEnd(20, '░')} ${d}/${t}`;
  const lastLog = existsSync(PATHS.bitacora)
    ? ultimosCiclos(readFileSync(PATHS.bitacora, 'utf8'))
    : '';
  return `# Estado del roadmap (autogenerado — no editar)

**Ciclo:** ${s.cycle} · **Fase actual:** ${s.current_phase} · **Progreso global:** ${bar(s.progress.done, s.progress.total)} (${s.progress.pct}%)

| Fase | Progreso |
|---|---|
${s.phases.map((p) => `| ${p.phase}. ${p.name} | ${bar(p.done, p.total)} |`).join('\n')}

**En curso:** ${s.in_progress ? `${s.in_progress.id} · ${s.in_progress.title}` : '—'}
**Siguiente:** ${s.next ? `${s.next.id} · ${s.next.title} (${s.next.priority}, ${s.next.effort})` : `— (${s.next_reason})`}

**Conteo:** ${Object.entries(s.counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ')}

${s.blocked.length ? `**Bloqueadas:**\n${s.blocked.map((b) => `- ${b.id} ${b.title} — ${b.reason}`).join('\n')}\n` : ''}
${s.validation_errors.length ? `⚠️ **Errores de validación:**\n${s.validation_errors.map((e) => `- ${e}`).join('\n')}\n` : ''}
## Últimos ciclos
${lastLog}
`;
}

export function writeState(data) {
  writeFileSync(PATHS.state, renderState(data));
}

export function saveAudit(name, content) {
  mkdirSync(PATHS.audits, { recursive: true });
  const file = resolve(
    PATHS.audits,
    `${new Date().toISOString().slice(0, 10)}-${name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.md`,
  );
  writeFileSync(file, content);
  return file;
}
