#!/usr/bin/env node
// MCP server (stdio) del roadmap de ViajaPro.
// Lo arranca OpenCode (ver opencode.jsonc → mcp.servers.roadmap).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as R from './roadmap.mjs';

const server = new McpServer({ name: 'viajapro-roadmap', version: '1.0.0' });
const text = (obj) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
});
const withData = (fn) => async (args) => {
  try {
    const store = R.load();
    const out = fn(store.data, args);
    R.save(store);
    R.writeState(store.data);
    return text(out);
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `ERROR: ${e.message}` }] };
  }
};

server.tool(
  'get_state',
  'Estado del roadmap: fase, progreso, tarea en curso, siguiente, bloqueadas.',
  {},
  async () => text(R.state(R.load().data)),
);

server.tool(
  'list_tasks',
  'Lista tareas, opcionalmente filtradas por status/phase/type.',
  { status: z.string().optional(), phase: z.number().optional(), type: z.string().optional() },
  async ({ status, phase, type }) => {
    const { data } = R.load();
    const ts = data.tasks.filter(
      (t) =>
        (!status || t.status === status) &&
        (!phase || t.phase === phase) &&
        (!type || t.type === type),
    );
    return text(
      ts.map(({ id, title, status, priority, effort, phase, depends_on, acceptance, files }) => ({
        id,
        title,
        status,
        priority,
        effort,
        phase,
        depends_on,
        acceptance,
        files,
      })),
    );
  },
);

server.tool('get_task', 'Detalle completo de una tarea.', { id: z.string() }, async ({ id }) => {
  const t = R.load().data.tasks.find((x) => x.id === id);
  return t ? text(t) : text(`ERROR: ${id} no existe`);
});

server.tool(
  'next_task',
  'Devuelve la tarea que toca ahora (in_progress si existe; si no, la elegible de mayor prioridad). NO la inicia.',
  {},
  async () => text(R.nextTask(R.load().data)),
);

server.tool(
  'start_task',
  'Marca una tarea como in_progress. Solo puede haber una. Requiere el número de ciclo.',
  { id: z.string(), cycle: z.number() },
  withData((d, { id, cycle }) => R.startTask(d, id, cycle)),
);

server.tool(
  'complete_task',
  'Marca la tarea in_progress como done. OBLIGATORIO: evidence con la salida de scripts/check.sh u otra verificación real.',
  { id: z.string(), evidence: z.string(), commit: z.string().optional() },
  withData((d, a) => R.completeTask(d, a.id, a)),
);

server.tool(
  'block_task',
  'Marca una tarea como blocked con motivo (p. ej. requiere decisión humana, secretos, plan Blaze).',
  { id: z.string(), reason: z.string() },
  withData((d, { id, reason }) => R.blockTask(d, id, reason)),
);

server.tool(
  'add_task',
  'Añade una tarea al backlog con criterios de aceptación verificables. Úsalo desde auditorías o cuando descubras trabajo necesario.',
  {
    title: z.string(),
    type: z.enum(R.TYPES),
    acceptance: z.array(z.string()).min(1),
    priority: z.enum(R.PRIORITIES).optional(),
    effort: z.enum(R.EFFORTS).optional(),
    phase: z.number().optional(),
    depends_on: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    source: z.string().optional(),
  },
  withData((d, a) => R.addTask(d, a)),
);

server.tool(
  'split_task',
  'Divide una tarea L en varias S/M encadenadas. La original queda dropped.',
  {
    id: z.string(),
    parts: z
      .array(
        z.object({
          title: z.string(),
          acceptance: z.array(z.string()).min(1),
          effort: z.enum(['S', 'M']).optional(),
          type: z.enum(R.TYPES).optional(),
          files: z.array(z.string()).optional(),
        }),
      )
      .min(2),
  },
  withData((d, { id, parts }) => R.splitTask(d, id, parts)),
);

server.tool(
  'log_cycle',
  'Registra el cierre de un ciclo en la bitácora e incrementa el contador. Llamar SIEMPRE al final de cada ciclo, aunque haya fallado.',
  {
    task_id: z.string().optional(),
    task_title: z.string().optional(),
    result: z.enum(['done', 'partial', 'failed', 'blocked', 'audit', 'no_task']),
    branch: z.string().optional(),
    commit: z.string().optional(),
    check_passed: z.boolean(),
    review_verdict: z.string().optional(),
    summary: z.string(),
    problems: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    next: z.string().optional(),
  },
  withData((d, a) => ({ cycle: R.logCycle(d, a) })),
);

server.tool(
  'save_audit',
  'Guarda un informe de auditoría en roadmap/audits/ (markdown). Después convierte hallazgos en tareas con add_task.',
  { name: z.string(), content: z.string() },
  async ({ name, content }) => text({ file: R.saveAudit(name, content) }),
);

server.tool('validate', 'Valida tasks.yaml y devuelve errores.', {}, async () =>
  text({ errors: R.validate(R.load().data) }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
