#!/usr/bin/env node
// Supervisor del ciclo autónomo de un carril (backend | frontend). Ver docs/CICLO.md.
//
//   node scripts/ciclo.mjs <backend|frontend> [--una] [--prueba] [--tarea T-123]
//
//   (sin banderas)  repite ciclos sin parar, respetando presupuesto, fallos y el fichero STOP
//   --una           ejecuta un solo ciclo y termina
//   --prueba        no publica nada: sin push, sin PR y sin limpiar el worktree (para ver qué haría)
//   --tarea T-123   fuerza la tarea (en vez de elegir la siguiente libre)
//   --elegir        solo muestra qué tarea tocaría y por qué, sin tocar nada
//   --auditar       fuerza una auditoría (la sesión auditora propone tareas nuevas) en vez de un ciclo de trabajo
//
// El MODELO nunca ve GitHub ni tokens: edita y hace commits locales. Este supervisor, que es
// un script determinista, hace las puertas de calidad, empuja y abre el PR (con scripts/gh-app.mjs)
// y activa el auto-merge. Las rutas protegidas esperan la aprobación asíncrona del Owner.
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const repoBase = resolve(aqui, '..');
const cfg = JSON.parse(readFileSync(join(aqui, 'ciclo.config.json'), 'utf8'));
const own = JSON.parse(readFileSync(join(repoBase, 'ownership.json'), 'utf8'));
const YAML = createRequire(join(repoBase, 'tools/roadmap-mcp/noop.js'))('yaml');

// ───────────────────────── argumentos ─────────────────────────
const args = process.argv.slice(2);
const lane = args[0];
const UNA = args.includes('--una');
const ELEGIR = args.includes('--elegir');
const AUDITAR = args.includes('--auditar');
const PRUEBA = args.includes('--prueba');
const TAREA_FORZADA = args.includes('--tarea') ? args[args.indexOf('--tarea') + 1] : null;
const carril = cfg.carriles[lane];
if (!carril) {
  console.error(
    'Uso: node scripts/ciclo.mjs <backend|frontend> [--una] [--prueba] [--tarea T-123]',
  );
  process.exit(2);
}

const base = resolve(process.env.VIAJAPRO_SESIONES || join(repoBase, '..', 'sesiones'));
const dir = join(base, `${lane}-auto`);
const logs = join(dir, 'logs');
mkdirSync(logs, { recursive: true });
const ficheroEstado = join(dir, 'estado.json');
const ficheroLog = join(dir, 'ciclo.log');
const BASH = existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';

// ───────────────────────── utilidades ─────────────────────────
const ahora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (m) => {
  const l = `[${ahora()}] [${lane}] ${m}`;
  console.log(l);
  appendFileSync(ficheroLog, l + '\n');
};
const dormir = (s) => new Promise((r) => setTimeout(r, s * 1000));
const hoy = () => new Date().toLocaleDateString('sv-SE');
const stopPedido = () => existsSync(join(base, 'STOP')) || existsSync(join(dir, 'STOP'));

function leerEstado() {
  let e = {
    fecha: hoy(),
    ciclos: 0,
    fallosSeguidos: 0,
    intentosPR: {},
    intentosTarea: {},
    parado: null,
  };
  try {
    e = { ...e, ...JSON.parse(readFileSync(ficheroEstado, 'utf8').replace(/^﻿/, '')) };
  } catch {
    /* primera vez */
  }
  if (e.fecha !== hoy()) {
    e.fecha = hoy();
    e.ciclos = 0;
  }
  return e;
}
const guardarEstado = (e) => writeFileSync(ficheroEstado, JSON.stringify(e, null, 2));
const latido = () => writeFileSync(join(dir, 'latido.txt'), `${ahora()}\n`);

function ejecutar(cmd, a, o = {}) {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o });
  return { codigo: r.status ?? 1, salida: `${r.stdout || ''}${r.stderr || ''}` };
}
const git = (cwd, ...a) => ejecutar('git', a, { cwd });
const ghComo = (ses, ...a) =>
  ejecutar(process.execPath, [join(aqui, 'gh-app.mjs'), ses, 'gh', ...a], { cwd: repoBase });
const ghApp = (...a) => ghComo(lane, ...a);
const recorte = (t, n = 4000) => (t.length > n ? '…' + t.slice(-n) : t);

// Lanza un proceso largo con límite de tiempo y lo mata con todo su árbol (Windows).
// - stdin va CERRADO: `opencode run` espera a que se cierre el stdin si es una tubería y, abierto, no termina nunca.
// - Los argumentos se entrecomillan (con shell, Node los une con espacios sin protegerlos).
// - La salida se escribe al log de forma incremental: un timeout no pierde lo ya producido.
const q = (x) => `"${String(x).replace(/"/g, '\\"')}"`;
function correr(cmd, a, { cwd, minutos, fichero }) {
  return new Promise((ok) => {
    const usaShell = process.platform === 'win32' && !/bash/.test(cmd);
    const trozos = [];
    if (fichero) writeFileSync(fichero, '');
    // OpenCode toma el directorio del proyecto de la variable PWD que hereda (Git Bash la fija); Node cambia el cwd real
    // pero no PWD, así que sin esto la sesión trabajaría en el directorio del supervisor y no en el worktree.
    const env = { ...process.env, ...(cwd ? { PWD: cwd } : {}) };
    const hijo = usaShell
      ? spawn([cmd, ...a.map(q)].join(' '), {
          cwd,
          env,
          shell: true,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(cmd, a, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let ultimoLatido = 0;
    const recibir = (d) => {
      const txt = d.toString();
      trozos.push(txt);
      if (fichero) appendFileSync(fichero, txt);
      if (Date.now() - ultimoLatido > 30000) {
        ultimoLatido = Date.now();
        latido();
      }
    };
    const t = setTimeout(() => {
      const aviso = `\n[TIEMPO AGOTADO tras ${minutos} min]\n`;
      trozos.push(aviso);
      if (fichero) appendFileSync(fichero, aviso);
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/PID', String(hijo.pid), '/T', '/F']);
      else hijo.kill('SIGKILL');
    }, minutos * 60000);
    hijo.stdout.on('data', recibir);
    hijo.stderr.on('data', recibir);
    hijo.on('close', (codigo) => {
      clearTimeout(t);
      const txt = trozos.join('');
      ok({ codigo, salida: txt, agotado: txt.includes('[TIEMPO AGOTADO') });
    });
    hijo.on('error', (e) => {
      clearTimeout(t);
      ok({ codigo: 1, salida: String(e), agotado: false });
    });
  });
}

// ───────────────────────── tareas ─────────────────────────
function aRegex(g) {
  return new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\0')
        .replace(/\*/g, '[^/]*')
        .replace(/\0/g, '.*') +
      '$',
  );
}
const reLane = Object.fromEntries(
  Object.entries(own.lanes).map(([k, v]) => [k, v.owns.map(aRegex)]),
);
const reShared = own.shared.map(aRegex);
function carrilDeTarea(t) {
  const duenos = new Set();
  for (const f of t.files ?? []) {
    if (reShared.some((r) => r.test(f))) continue;
    const d = Object.keys(reLane).find((k) => reLane[k].some((r) => r.test(f)));
    if (d) duenos.add(d);
  }
  return duenos.size === 1 ? [...duenos][0] : null;
}
const prefijoCarril = { backend: 'a', frontend: 'b' };

function prsDelCarril() {
  const r = ghApp(
    'pr',
    'list',
    '--repo',
    cfg.repo,
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'number,title,headRefName,state,isDraft,author,statusCheckRollup,mergeStateStatus,autoMergeRequest',
  );
  try {
    return JSON.parse(r.salida);
  } catch {
    return [];
  }
}

// PRs abiertos del carril: los que tocan rutas protegidas esperan al Owner y se cuentan aparte (no bloquean el trabajo normal).
function contarPrs(prs) {
  let normales = 0;
  let protegidos = 0;
  const prot = own.humanRequired.map(aRegex);
  for (const p of prs.filter(
    (x) => x.state === 'OPEN' && (x.author?.login || '').includes(`viajapro-${lane}`) && !x.isDraft,
  )) {
    let ficheros = [];
    try {
      ficheros = JSON.parse(
        ghApp('pr', 'view', String(p.number), '--repo', cfg.repo, '--json', 'files').salida,
      ).files.map((f) => f.path);
    } catch {
      /* sin datos */
    }
    if (ficheros.some((f) => prot.some((r) => r.test(f)))) protegidos++;
    else normales++;
  }
  return { normales, protegidos };
}

function elegirTarea(prs, estado = leerEstado()) {
  // Se lee de origin/main, no de la carpeta del supervisor (puede estar en una rama antigua y no ver las tareas que entraron después).
  const crudo = git(repoBase, 'show', 'origin/main:roadmap/tasks.yaml');
  const tareas = YAML.parse(
    crudo.codigo === 0 ? crudo.salida : readFileSync(join(repoBase, 'roadmap/tasks.yaml'), 'utf8'),
  ).tasks;
  const hechas = new Set(tareas.filter((t) => t.status === 'done').map((t) => t.id));
  const reservadas = new Set();
  for (const p of prs)
    for (const id of `${p.headRefName}`.match(/T-\d{3}/g) ?? []) reservadas.add(id);
  for (const l of git(repoBase, 'worktree', 'list', '--porcelain').salida.split('\n'))
    for (const id of l.match(/T-\d{3}/g) ?? []) reservadas.add(id);
  for (const l of git(repoBase, 'branch', '-r').salida.split('\n'))
    for (const id of l.match(/T-\d{3}/g) ?? []) reservadas.add(id);
  // Ficheros ya en juego (tareas reservadas y no terminadas): no se elige otra tarea que los toque.
  const enJuego = tareas
    .filter((x) => reservadas.has(x.id) && x.status !== 'done')
    .flatMap((x) => x.files ?? []);
  const solapa = (t) =>
    (t.files ?? []).some((f) =>
      enJuego.some(
        (g) =>
          f === g || (g.endsWith('/') && f.startsWith(g)) || (f.endsWith('/') && g.startsWith(f)),
      ),
    );
  const prio = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const esf = { S: 0, M: 1, L: 9 };
  const candidatas = tareas.filter(
    (t) =>
      ['backlog', 'ready'].includes(t.status) &&
      !cfg.excluirTareas.includes(t.id) &&
      !reservadas.has(t.id) &&
      (estado.intentosTarea?.[t.id] ?? 0) < cfg.maxIntentosPorTarea &&
      (t.depends_on ?? []).every((d) => hechas.has(d)) &&
      esf[t.effort] !== 9 &&
      carrilDeTarea(t) === carril.prefijo &&
      !solapa(t) &&
      !(t.files ?? []).some((f) => cfg.noPublicables.some((r) => new RegExp(r).test(f))),
  );
  if (ELEGIR)
    console.log(
      `[traza] tareas=${tareas.length} reservadas=${[...reservadas].sort().join(',')} hechas=${hechas.size} candidatas=${candidatas.map((c) => c.id).join(',') || 'ninguna'}`,
    );
  candidatas.sort(
    (x, y) =>
      prio[x.priority] - prio[y.priority] ||
      esf[x.effort] - esf[y.effort] ||
      x.id.localeCompare(y.id),
  );
  if (TAREA_FORZADA)
    return { tarea: tareas.find((t) => t.id === TAREA_FORZADA) ?? null, libres: candidatas.length };
  return { tarea: candidatas[0] ?? null, libres: candidatas.length };
}
const slugDe = (t) =>
  t.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '') || 'trabajo';

// ───────────────────────── carpeta del carril y worktrees ─────────────────────────
function prepararCarpeta() {
  copyFileSync(join(repoBase, `.opencode/sesiones/${lane}.jsonc`), join(dir, 'opencode.jsonc'));
  copyFileSync(join(repoBase, `.opencode/sesiones/${lane}.auto.AGENTS.md`), join(dir, 'AGENTS.md'));
}
function permisosAuto(wt, sesion = lane) {
  mkdirSync(join(wt, '.opencode'), { recursive: true });
  copyFileSync(
    join(repoBase, '.opencode/sesiones/auto.permisos.jsonc'),
    join(wt, '.opencode/opencode.jsonc'),
  );
  const excl = git(repoBase, 'rev-parse', '--git-path', 'info/exclude').salida.trim();
  const ruta = resolve(repoBase, excl);
  const actual = existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';
  for (const f of [
    '.opencode/opencode.jsonc',
    'PLAN.md',
    'REVISION.json',
    'RESULTADO.md',
    'FASE.md',
    'TAREA.md',
    'AUDITORIA.md',
    'PROPUESTAS.json',
    'PROPUESTAS.revisadas.json',
  ])
    if (!actual.split('\n').includes(f)) appendFileSync(ruta, f + '\n');
  git(repoBase, 'config', 'extensions.worktreeConfig', 'true');
  const apps = JSON.parse(readFileSync(join(aqui, 'gh-apps.json'), 'utf8')).apps;
  git(wt, 'config', '--worktree', 'user.name', `viajapro-${sesion}[bot]`);
  git(
    wt,
    'config',
    '--worktree',
    'user.email',
    `${apps[sesion]}+viajapro-${sesion}[bot]@users.noreply.github.com`,
  );
}
function crearWorktree(t) {
  const rama = `${carril.prefijo}/${t.id}-${slugDe(t)}`;
  const wt = join(dir, `${t.id}-${slugDe(t)}-${Date.now().toString(36)}`);
  git(repoBase, 'branch', '-D', rama);
  const r = git(repoBase, 'worktree', 'add', '-q', wt, '-b', rama, 'origin/main');
  if (r.codigo !== 0) throw new Error(`no se pudo crear el worktree: ${r.salida}`);
  permisosAuto(wt);
  return { rama, wt };
}
function escribirTarea(wt, t, rama, sha) {
  const bloque = YAML.stringify({
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    effort: t.effort,
    acceptance: t.acceptance,
    files: t.files,
  });
  writeFileSync(
    join(wt, 'TAREA.md'),
    `# ${t.id} — tarea de este ciclo\n\nExtraída de roadmap/tasks.yaml (origin/main @ ${sha}). Los criterios de aceptación son lo que debes cumplir.\n\n\`\`\`yaml\n${bloque}\`\`\`\n\nRama: \`${rama}\`.\n`,
  );
}

// ───────────────────────── fases con el modelo ─────────────────────────
async function fase(nombre, { wt, modelo, mensaje, t, esperado }) {
  writeFileSync(join(wt, 'FASE.md'), mensaje);
  // `modelo` puede ser una lista: se prueba en orden y se pasa al siguiente si no produce lo esperado
  // (tiempo agotado, límite de peticiones, respuesta vacía…). NVIDIA primero y los gratuitos de OpenCode de respaldo.
  const modelos = Array.isArray(modelo) ? modelo : [modelo];
  let r = null;
  for (const [i, m] of modelos.entries()) {
    const fichero = join(logs, `${hoy()}-${t.id}-${nombre}${i ? `-respaldo${i}` : ''}.log`);
    log(`fase «${nombre}» con ${m}${i ? ' (respaldo)' : ''}…`);
    r = await correr(
      'opencode',
      [
        'run',
        '--auto',
        '--model',
        m,
        '--title',
        `${lane}-auto ${t.id} ${nombre}`,
        'Lee FASE.md en la raíz de este worktree y ejecútalo entero.',
      ],
      {
        cwd: wt,
        minutos: Math.min(
          i ? cfg.minutosFaseRespaldo : 999,
          cfg.minutosFase?.[nombre] ?? cfg.minutosPorFase,
        ),
        fichero,
      },
    );
    latido();
    if (r.agotado) log(`fase «${nombre}» agotó el tiempo con ${m}`);
    if (!esperado || esperado()) return r;
    if (i < modelos.length - 1)
      log(
        `fase «${nombre}»: ${m} no produjo el resultado esperado; pruebo con el siguiente modelo`,
      );
  }
  return r;
}
const lista = (m) => [].concat(m).join(', ');
// Crea el PR con la etiqueta «autonomo»; si la etiqueta no existe o no se puede añadir, reintenta sin ella (el PR es lo importante).
function crearPr(ses, rama, titulo, cuerpo) {
  const base = [
    'pr',
    'create',
    '--repo',
    cfg.repo,
    '--base',
    'main',
    '--head',
    rama,
    '--title',
    titulo,
    '--body',
    cuerpo,
  ];
  let r = ghComo(ses, ...base, '--label', 'autonomo');
  if (r.codigo !== 0 && /label/i.test(r.salida)) {
    log('la etiqueta «autonomo» no se pudo añadir: creo el PR sin ella');
    r = ghComo(ses, ...base);
  }
  return r;
}
// Si el agente dejó cambios sin commitear, el supervisor los recoge (las puertas posteriores los juzgan igual).
function commitPendiente(wt, t) {
  if (!git(wt, 'status', '--porcelain').salida.trim()) return false;
  git(wt, 'add', '-A');
  const r = git(
    wt,
    'commit',
    '-q',
    '--no-verify',
    '-m',
    `feat: ${t.id} (cambios del agente recogidos por el supervisor)`,
  );
  log(`commit automático de cambios sin commitear: ${r.codigo === 0 ? 'ok' : 'falló'}`);
  return r.codigo === 0;
}
const hayCommits = (wt) =>
  Number(git(wt, 'rev-list', '--count', 'origin/main..HEAD').salida.trim() || 0) > 0 ||
  git(wt, 'status', '--porcelain').salida.trim() !== '';

const REGLAS = `Recuerda: trabajas sin supervisión (nadie te contestará), sin GitHub ni red, y escribes directamente en los ficheros (nada de fix_*.py/apply_*.py). Verifica los hechos con comandos antes de afirmarlos (existencia de ficheros, scripts y lockfiles de package.json, ramas, jobs). No inventes IDs ni APIs.`;

const promptPlan = (t) =>
  `# Fase PLANIFICAR — ${t.id}\n\nLee AGENTS.md (tu rol), TAREA.md y lo que necesites del repo. **No edites código en esta fase.**\nEscribe \`PLAN.md\` en la raíz del worktree con: (1) qué cambiar, fichero por fichero; (2) cómo cumple cada criterio de aceptación; (3) riesgos y qué verificaste (con el comando); (4) cómo se probará.\n\n${REGLAS}\n`;
const promptRevision = (t) =>
  `# Fase REVISAR EL PLAN — ${t.id}\n\nEres un revisor independiente. Lee TAREA.md y PLAN.md y **contrasta el plan con el repo real** (haz como mucho 10 comprobaciones puntuales, las de mayor riesgo: que los ficheros, dependencias, scripts y lockfiles que cita existen y dicen lo que afirma; no releas el repo entero: tu tiempo es limitado y, si dudas, decide con lo que tengas). **No edites código.**\nEscribe \`REVISION.json\` en la raíz con exactamente: {"veredicto":"aprobado"|"rechazado","problemas":["…"]}. Rechaza si el plan omite un criterio de aceptación, se sale del carril de AGENTS.md, afirma algo falso o es inseguro. Si apruebas, "problemas" puede ir vacío.\n`;
const promptImplementa = (t, revision) =>
  `# Fase IMPLEMENTAR — ${t.id}\n\nImplementa PLAN.md cumpliendo todos los criterios de TAREA.md, con tests. ${revision?.problemas?.length ? `El revisor señaló, y debes atender: ${JSON.stringify(revision.problemas)}.\n` : ''}Mantén el cambio DENTRO de los ficheros de TAREA.md y de tu carril, y de tamaño razonable (el supervisor descarta más de ${cfg.limites.maxFicheros} ficheros o ${cfg.limites.maxLineas} líneas): si un criterio exige más, implementa el núcleo, y anota en RESULTADO.md lo que queda para otra tarea; no reorganices ni dividas ficheros que no son tuyos. Haz uno o varios commits locales con mensaje convencional que incluya ${t.id}. Antes de terminar ejecuta las comprobaciones relevantes (formato, analyze, tests) y arregla lo que falle.\nAl acabar escribe \`RESULTADO.md\` (qué hiciste, qué no pudiste hacer y por qué, cómo verificarlo). No hagas push ni uses gh.\n\n${REGLAS}\n`;
const promptRepara = (t, fallo) =>
  `# Fase REPARAR — ${t.id}\n\nLas puertas de calidad fallaron con esto:\n\n\`\`\`\n${recorte(fallo, 6000)}\n\`\`\`\n\nCorrige la causa (no desactives ni saltes comprobaciones), haz commit local y actualiza \`RESULTADO.md\`. No hagas push ni uses gh.\n\n${REGLAS}\n`;

// ───────────────────────── puertas de calidad ─────────────────────────
async function puertas(wt, rama, t = null) {
  const motivos = [];
  let salida = '';
  const ficheros = git(wt, 'diff', '--name-only', 'origin/main...HEAD')
    .salida.split('\n')
    .filter(Boolean);
  if (!ficheros.length)
    return {
      ok: false,
      motivos: ['el ciclo no produjo ningún commit con cambios'],
      salida: '',
      ficheros,
    };
  // Tamaño = lo mayor entre líneas añadidas y borradas: un refactor que MUEVE código cuenta una vez, no dos (T-016 sumaba 2165 por mover ~1000).
  const estad = git(wt, 'diff', '--shortstat', 'origin/main...HEAD').salida;
  const lineas = Math.max(
    Number((estad.match(/(\d+) insertion/) ?? [])[1] ?? 0),
    Number((estad.match(/(\d+) deletion/) ?? [])[1] ?? 0),
  );
  if (ficheros.length > cfg.limites.maxFicheros)
    motivos.push(`demasiados ficheros (${ficheros.length} > ${cfg.limites.maxFicheros})`);
  if (lineas > cfg.limites.maxLineas)
    motivos.push(`demasiadas líneas (${lineas} > ${cfg.limites.maxLineas})`);
  for (const f of ficheros)
    for (const p of cfg.prohibidos)
      if (new RegExp(p).test(f)) motivos.push(`fichero prohibido: ${f}`);
  for (const f of ficheros)
    if (cfg.noPublicables.some((r) => new RegExp(r).test(f)))
      motivos.push(`toca ${f}: una app no puede publicar workflows; lo hace una persona`);
  if (t) {
    // El agente debe haber terminado (RESULTADO.md) y haber trabajado en lo que se le pidió: un fichero de exploración suelto no es una entrega.
    if (!existsSync(join(wt, 'RESULTADO.md')))
      motivos.push('el agente no escribió RESULTADO.md (no terminó)');
    const previstos = t.files ?? [];
    const toca = (f) => previstos.some((g) => f === g || (g.endsWith('/') && f.startsWith(g)));
    if (previstos.length && !ficheros.some(toca))
      motivos.push(
        `el cambio no toca ninguno de los ficheros previstos de ${t.id} (${previstos.join(', ')})`,
      );
  }
  const oc = ejecutar(
    process.execPath,
    [join(aqui, 'check-ownership.mjs'), '--branch', rama, '--base', 'origin/main'],
    { cwd: wt },
  );
  if (oc.codigo !== 0) motivos.push('cruza de carril:\n' + recorte(oc.salida, 800));
  if (motivos.length) return { ok: false, motivos, salida, ficheros };

  // Las puertas del proyecto, no otras: `pnpm compuertas --rapido` (lint, typecheck, test, formato) y las fronteras
  // entre módulos. `build` y `db:aislamiento` (necesita Postgres) los corre el CI del servidor, que es quien manda.
  const inst = await correr('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
    cwd: wt,
    minutos: 10,
  });
  salida += `
== pnpm install (código ${inst.codigo})
${recorte(inst.salida, 1500)}`;
  if (inst.codigo !== 0)
    motivos.push(
      'pnpm install --frozen-lockfile falló (¿cambió dependencias sin actualizar el lockfile?)',
    );
  if (!motivos.length) {
    const chk = await correr('pnpm', ['compuertas', '--rapido'], { cwd: wt, minutos: 30 });
    salida += `
== pnpm compuertas --rapido (código ${chk.codigo})
${recorte(chk.salida, 3000)}`;
    if (chk.codigo !== 0) motivos.push('pnpm compuertas --rapido falló');
    const fr = await correr('pnpm', ['verificar:fronteras'], { cwd: wt, minutos: 5 });
    salida += `
== verificar:fronteras (código ${fr.codigo})
${recorte(fr.salida, 1500)}`;
    if (fr.codigo !== 0) motivos.push('verificar:fronteras falló (un módulo importa a otro)');
  }
  return { ok: motivos.length === 0, motivos, salida, ficheros };
}

// ───────────────────────── publicar ─────────────────────────
const TIPO = {
  feature: 'feat',
  bug: 'fix',
  security: 'fix',
  refactor: 'refactor',
  test: 'test',
  infra: 'ci',
  docs: 'docs',
  audit: 'docs',
};
function publicar(t, rama, wt, g) {
  const p = ejecutar(process.execPath, [join(aqui, 'gh-app.mjs'), lane, 'push'], { cwd: wt });
  if (p.codigo !== 0) return { ok: false, detalle: 'push: ' + recorte(p.salida, 600) };
  let resultado = '';
  try {
    resultado = readFileSync(join(wt, 'RESULTADO.md'), 'utf8').slice(0, 3000);
  } catch {
    /* sin resultado */
  }
  const protegida = g.ficheros.filter((f) => own.humanRequired.map(aRegex).some((r) => r.test(f)));
  const cuerpo = `Generado por el ciclo autónomo del carril **${lane}** (modelos \`${lista(carril.modeloImplementa)}\`, revisor \`${lista(carril.modeloRevisa)}\`).\n\n## Resultado\n${resultado || '_sin RESULTADO.md_'}\n\n## Puertas superadas\n- pnpm compuertas --rapido y verificar:fronteras (el CI corre además build y aislamiento entre tenants)\n- límites de tamaño, ficheros prohibidos y carril (ownership.json)\n${protegida.length ? `\n**Requiere aprobación del Owner** (rutas protegidas): ${protegida.join(', ')}\n` : ''}`;
  const titulo = `${TIPO[t.type] ?? 'chore'}(${lane}): ${t.title} (${t.id})`.slice(0, 200);
  const c = crearPr(lane, rama, titulo, cuerpo);
  if (c.codigo !== 0) return { ok: false, detalle: 'pr create: ' + recorte(c.salida, 600) };
  const url = (c.salida.match(/https:\/\/github\.com\/\S+\/pull\/\d+/) ?? [])[0] ?? '';
  const m = ghApp('pr', 'merge', rama, '--repo', cfg.repo, '--auto', '--squash');
  return { ok: true, url, autoMerge: m.codigo === 0, protegida: protegida.length > 0 };
}

// ───────────────────────── reparación de PRs propios ─────────────────────────
async function repararPrs(estado, prs) {
  for (const p of prs) {
    if (
      p.state === 'OPEN' &&
      !p.isDraft &&
      p.autoMergeRequest &&
      p.mergeStateStatus === 'BEHIND' &&
      (p.author?.login || '').includes('viajapro-')
    ) {
      const r = ghComo(
        (p.author.login.match(/viajapro-(\w+)/) ?? [])[1] ?? lane,
        'api',
        '-X',
        'PUT',
        `repos/${cfg.repo}/pulls/${p.number}/update-branch`,
      );
      log(
        `PR #${p.number} (${p.author.login}) atrasado con auto-merge: ${r.codigo === 0 ? 'actualizado con main' : 'no se pudo actualizar (' + recorte(r.salida, 120).replace(/\s+/g, ' ') + ')'}`,
      );
    }
  }
  for (const p of prs) {
    if (p.state !== 'OPEN' || !(p.headRefName || '').startsWith(`${carril.prefijo}/`)) continue;
    if (!(p.author?.login || '').includes(`viajapro-${lane}`)) continue;
    const rojos = (p.statusCheckRollup ?? []).filter((c) => c.conclusion === 'FAILURE');
    const n = estado.intentosPR[p.number] ?? 0;
    if (p.mergeStateStatus === 'BEHIND') {
      ghApp('api', '-X', 'PUT', `repos/${cfg.repo}/pulls/${p.number}/update-branch`);
      log(`PR #${p.number} actualizado con main`);
      continue;
    }
    if (!rojos.length) continue;
    if (n >= cfg.maxReparacionesPorPr) {
      if (n === cfg.maxReparacionesPorPr) {
        ghApp(
          'pr',
          'comment',
          String(p.number),
          '--repo',
          cfg.repo,
          '--body',
          `El ciclo autónomo agotó ${n} reparaciones. Necesita revisión humana.`,
        );
        estado.intentosPR[p.number] = n + 1;
        guardarEstado(estado);
      }
      continue;
    }
    log(
      `PR #${p.number} con checks rojos (${rojos.map((r) => r.name).join(', ')}): reparación ${n + 1}/${cfg.maxReparacionesPorPr}`,
    );
    estado.intentosPR[p.number] = n + 1;
    guardarEstado(estado);
    const run = ghApp(
      'run',
      'list',
      '--repo',
      cfg.repo,
      '--branch',
      p.headRefName,
      '--limit',
      '1',
      '--json',
      'databaseId',
    );
    let id;
    try {
      id = JSON.parse(run.salida)[0].databaseId;
    } catch {
      continue;
    }
    const fallo = ghApp('run', 'view', String(id), '--repo', cfg.repo, '--log-failed').salida;
    const idt = (p.headRefName.match(/T-\d{3}/) ?? ['T-000'])[0];
    const wt = join(dir, `reparar-${p.number}-${Date.now().toString(36)}`);
    git(repoBase, 'fetch', '-q', 'origin', p.headRefName);
    git(repoBase, 'branch', '-D', p.headRefName);
    if (
      git(repoBase, 'worktree', 'add', '-q', wt, '-b', p.headRefName, `origin/${p.headRefName}`)
        .codigo !== 0
    )
      continue;
    permisosAuto(wt);
    const tarea = { id: idt, title: p.title };
    await fase('reparar', {
      wt,
      modelo: carril.modeloImplementa,
      mensaje: promptRepara(tarea, fallo),
      t: tarea,
      esperado: () => hayCommits(wt),
    });
    commitPendiente(wt, tarea);
    const g = await puertas(wt, p.headRefName);
    if (g.ok) {
      const pu = ejecutar(process.execPath, [join(aqui, 'gh-app.mjs'), lane, 'push'], { cwd: wt });
      log(`PR #${p.number}: reparación ${pu.codigo === 0 ? 'empujada' : 'NO se pudo empujar'}`);
    } else log(`PR #${p.number}: la reparación no pasó las puertas (${g.motivos.join('; ')})`);
    git(repoBase, 'worktree', 'remove', '--force', wt);
  }
}

// ───────────────────────── auditoría: la sesión auditora propone tareas ─────────────────────────
const dirAud = join(base, 'auditoria-auto');
const fichUltima = join(dirAud, 'ultima.json');
function enfriada(horas = cfg.auditoria.enfriamientoHoras) {
  try {
    const u = JSON.parse(readFileSync(fichUltima, 'utf8'));
    return Date.now() - new Date(u.fecha).getTime() < horas * 3600000;
  } catch {
    return false;
  }
}
function bloquearAuditoria() {
  mkdirSync(dirAud, { recursive: true });
  const lock = join(dirAud, 'LOCK');
  try {
    writeFileSync(lock, `${lane} ${ahora()}`, { flag: 'wx' });
    return true;
  } catch {
    try {
      if ((Date.now() - statSync(lock).mtimeMs) / 3600000 > 3) {
        rmSync(lock, { force: true });
        return bloquearAuditoria();
      }
    } catch {
      /* sin lock */
    }
    return false;
  }
}
const palabras = (t) =>
  new Set(
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
const parecido = (a, b) => {
  const x = palabras(a),
    y = palabras(b);
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / Math.max(1, new Set([...x, ...y]).size);
};

function validarPropuestas(lista, existentes, wt) {
  const validas = [];
  const rechazadas = [];
  const TIPOS = ['security', 'bug', 'refactor', 'test', 'feature', 'docs', 'infra', 'audit'];
  const prioN = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const tope = prioN[cfg.auditoria.prioridadMaxima] ?? 2;
  for (const [i, pr] of (Array.isArray(lista) ? lista : []).entries()) {
    const motivo = (m) =>
      rechazadas.push({ indice: i, titulo: String(pr?.title ?? '?').slice(0, 70), motivo: m });
    if (!pr || typeof pr.title !== 'string' || pr.title.trim().length < 15) {
      motivo('título ausente o demasiado corto');
      continue;
    }
    if (!TIPOS.includes(pr.type)) {
      motivo(`tipo inválido «${pr.type}»`);
      continue;
    }
    if (!['S', 'M'].includes(pr.effort)) {
      motivo('el esfuerzo debe ser S o M (divide la tarea)');
      continue;
    }
    if (
      !Array.isArray(pr.acceptance) ||
      pr.acceptance.filter((a) => typeof a === 'string' && a.trim().length > 8).length < 2
    ) {
      motivo('necesita al menos 2 criterios de aceptación verificables');
      continue;
    }
    if (!Array.isArray(pr.files) || !pr.files.length) {
      motivo('faltan los ficheros afectados');
      continue;
    }
    const mal = pr.files.find(
      (f) =>
        typeof f !== 'string' || (!existsSync(join(wt, f)) && !existsSync(join(wt, dirname(f)))),
    );
    if (mal) {
      motivo(`ruta inexistente: ${mal}`);
      continue;
    }
    if (pr.files.some((f) => cfg.noPublicables.some((r) => new RegExp(r).test(f)))) {
      motivo('toca workflows (no publicable por una app)');
      continue;
    }
    const c = carrilDeTarea({ files: pr.files });
    if (!['a', 'b'].includes(c)) {
      motivo('mezcla carriles o no pertenece a ninguno (divídela en una tarea por carril)');
      continue;
    }
    const dup = existentes.find((e) => parecido(e.title, pr.title) >= 0.6);
    if (dup) {
      motivo(`duplica ${dup.id} «${dup.title.slice(0, 50)}»`);
      continue;
    }
    if (validas.some((v) => parecido(v.title, pr.title) >= 0.6)) {
      motivo('duplicada dentro de la propia auditoría');
      continue;
    }
    validas.push({
      ...pr,
      priority: ['P0', 'P1', 'P2', 'P3'].includes(pr.priority)
        ? prioN[pr.priority] < tope
          ? cfg.auditoria.prioridadMaxima
          : pr.priority
        : 'P3',
    });
  }
  return { validas: validas.slice(0, cfg.auditoria.maxTareasNuevas), rechazadas };
}

async function auditoria(libres) {
  if (!bloquearAuditoria()) {
    log('otra auditoría está en curso (LOCK): no lanzo otra');
    return 'auditoria-ocupada';
  }
  const fecha = hoy().replace(/-/g, '');
  const rama = `i/T-000-auditoria-${fecha}`;
  const wt = join(dirAud, `auditoria-${fecha}-${Date.now().toString(36)}`);
  const t = { id: 'T-000', title: 'auditoría' };
  try {
    copyFileSync(
      join(repoBase, '.opencode/sesiones/auditora.jsonc'),
      join(dirAud, 'opencode.jsonc'),
    );
    copyFileSync(
      join(repoBase, '.opencode/sesiones/auditora.auto.AGENTS.md'),
      join(dirAud, 'AGENTS.md'),
    );
    git(repoBase, 'branch', '-D', rama);
    if (git(repoBase, 'worktree', 'add', '-q', wt, '-b', rama, 'origin/main').codigo !== 0)
      throw new Error('no se pudo crear el worktree de la auditoría');
    permisosAuto(wt, 'integradora');
    const sha = git(repoBase, 'rev-parse', '--short', 'origin/main').salida.trim();
    const R = await import(pathToFileURL(join(repoBase, 'tools/roadmap-mcp/roadmap.mjs')).href);
    const fichTareas = join(wt, 'roadmap/tasks.yaml');
    const antes = R.load(fichTareas).data.tasks;
    const resumen = `tareas totales: ${antes.length}; libres para el carril ${lane}: ${libres}`;
    const msg = `# Fase AUDITAR — repositorio ViajaPro (origin/main @ ${sha})\n\nSituación: ${resumen}. Al carril ${lane} le quedan ${libres} tareas libres: hay que reponer trabajo, también para el otro carril si lo ves necesario.\n**Objetivo prioritario ahora:** ${cfg.objetivo}\nEmpieza por ahí: contrasta cada criterio de aceptación de ese objetivo con el código real (ficheros y tests) y propone una tarea por cada criterio que NO se cumpla (con su test), antes de proponer ninguna otra cosa. Después, si te quedan propuestas, cubre el resto de huecos.\nSigue AGENTS.md (tu rol) al pie de la letra. **No edites código ni roadmap/tasks.yaml.**\nEscribe en la raíz de este worktree:\n1. \`AUDITORIA.md\`: hallazgos con evidencia (fichero:línea o salida de un comando), ordenados por importancia, y qué NO encontraste.\n2. \`PROPUESTAS.json\`: un array JSON de tareas nuevas: [{"title":"…","type":"security|bug|refactor|test|feature|docs|infra","priority":"P1|P2|P3","effort":"S|M","phase":1,"acceptance":["criterio verificable","…"],"files":["ruta/real","…"],"evidencia":"fichero:línea o comando"}].\n\n${REGLAS}\n`;
    await fase('auditoria', {
      wt,
      modelo: cfg.auditoria.modelo,
      mensaje: msg,
      t,
      esperado: () => existsSync(join(wt, 'PROPUESTAS.json')),
    });
    let propuestas = [];
    try {
      propuestas = JSON.parse(readFileSync(join(wt, 'PROPUESTAS.json'), 'utf8'));
    } catch {
      log('la auditora no produjo un PROPUESTAS.json válido');
    }
    if (!Array.isArray(propuestas) || !propuestas.length) {
      writeFileSync(
        fichUltima,
        JSON.stringify({ fecha: new Date().toISOString(), resultado: 'sin propuestas' }),
      );
      return 'auditoria-vacia';
    }

    // revisión independiente de las propuestas por otro modelo
    const msgRev = `# Fase REVISAR LAS PROPUESTAS — auditoría\n\nEres un revisor independiente. Lee AUDITORIA.md y PROPUESTAS.json y **contrasta cada propuesta con el repo real**: la evidencia existe, no duplica una tarea de roadmap/tasks.yaml (en cualquier estado), es de un solo carril, sus criterios son verificables y su esfuerzo es S o M. Haz como mucho 12 comprobaciones puntuales (las de mayor riesgo): tu tiempo es limitado y, si dudas, decide con lo que tengas. **No edites nada salvo el fichero de salida.**\nEscribe \`PROPUESTAS.revisadas.json\` con exactamente: {"rechazar":[{"indice":0,"motivo":"…"}]} (índices de PROPUESTAS.json; array vacío si todas valen).\n`;
    await fase('auditoria-revision', {
      wt,
      modelo: cfg.auditoria.modeloRevisa,
      mensaje: msgRev,
      t,
      esperado: () => existsSync(join(wt, 'PROPUESTAS.revisadas.json')),
    });
    let rechazos = [];
    try {
      rechazos =
        JSON.parse(readFileSync(join(wt, 'PROPUESTAS.revisadas.json'), 'utf8')).rechazar ?? [];
    } catch {
      log(
        'el revisor no produjo PROPUESTAS.revisadas.json: solo se aplica la validación automática',
      );
    }
    const idxRechazados = new Set(rechazos.map((r) => r.indice));
    const { validas, rechazadas } = validarPropuestas(
      propuestas.filter((_, i) => !idxRechazados.has(i)),
      antes,
      wt,
    );
    for (const r of rechazos)
      rechazadas.push({
        indice: r.indice,
        titulo: String(propuestas[r.indice]?.title ?? '?').slice(0, 70),
        motivo: `revisor: ${r.motivo}`,
      });
    log(
      `auditoría: ${propuestas.length} propuestas → ${validas.length} válidas, ${rechazadas.length} descartadas${
        rechazadas.length
          ? ' (' +
            rechazadas
              .map((r) => r.motivo)
              .join(' | ')
              .slice(0, 300) +
            ')'
          : ''
      }`,
    );
    writeFileSync(
      fichUltima,
      JSON.stringify({
        fecha: new Date().toISOString(),
        propuestas: propuestas.length,
        validas: validas.length,
      }),
    );
    if (!validas.length) return 'auditoria-vacia';

    const store = R.load(fichTareas);
    const nuevas = validas.map((v) =>
      R.addTask(store.data, {
        title: v.title.trim(),
        type: v.type,
        priority: v.priority,
        effort: v.effort,
        phase: v.phase ?? store.data.meta.current_phase,
        acceptance: v.acceptance,
        files: v.files,
        source: `auditoria-auto:${hoy()}`,
      }),
    );
    const errores = R.validate(store.data);
    if (errores.length)
      throw new Error('tasks.yaml no valida tras añadir las tareas: ' + errores.join('; '));
    R.save(store, fichTareas);
    const informe = `roadmap/audits/${hoy()}-auditoria-automatica.md`;
    mkdirSync(join(wt, 'roadmap/audits'), { recursive: true });
    const tabla = nuevas
      .map((n) => `| ${n.id} | ${n.priority}/${n.effort} | ${n.title} |`)
      .join('\n');
    const desc = rechazadas.length
      ? `\n\n## Propuestas descartadas\n${rechazadas.map((r) => `- «${r.titulo}»: ${r.motivo}`).join('\n')}\n`
      : '';
    writeFileSync(
      join(wt, informe),
      `# Auditoría automática ${hoy()}\n\n> Generada por la sesión auditora del ciclo autónomo (modelos \`${lista(cfg.auditoria.modelo)}\`, revisor \`${lista(cfg.auditoria.modeloRevisa)}\`, origin/main @ ${sha}). ${resumen}.\n\n## Tareas nuevas\n| ID | Prioridad/Esfuerzo | Título |\n|---|---|---|\n${tabla}${desc}\n\n---\n\n${readFileSync(join(wt, 'AUDITORIA.md'), 'utf8')}\n`,
    );
    git(wt, 'add', 'roadmap');
    const c = git(
      wt,
      'commit',
      '-q',
      '-m',
      `docs(roadmap): auditoría automática, ${nuevas.length} tareas nuevas (T-000)`,
    );
    if (c.codigo !== 0) throw new Error('commit de la auditoría: ' + c.salida);
    if (PRUEBA) {
      log(
        `PRUEBA: auditoría completa (${nuevas.map((n) => n.id).join(', ')}). Worktree conservado en ${wt}; nada se publicó.`,
      );
      return 'prueba';
    }
    const push = ejecutar(process.execPath, [join(aqui, 'gh-app.mjs'), 'integradora', 'push'], {
      cwd: wt,
    });
    if (push.codigo !== 0) throw new Error('push de la auditoría: ' + recorte(push.salida, 500));
    const cuerpo = `Auditoría automática del ciclo autónomo: **${nuevas.length} tareas nuevas** (${nuevas.map((n) => n.id).join(', ')}). Informe en \`${informe}\`.\n\nSolo toca \`roadmap/**\`; las tareas entran con prioridad máxima ${cfg.auditoria.prioridadMaxima} y el Owner puede reordenarlas.`;
    const pc = crearPr(
      'integradora',
      rama,
      `docs(roadmap): auditoría automática, ${nuevas.length} tareas nuevas (T-000)`,
      cuerpo,
    );
    if (pc.codigo !== 0) throw new Error('pr create de la auditoría: ' + recorte(pc.salida, 500));
    ghComo('integradora', 'pr', 'merge', rama, '--repo', cfg.repo, '--auto', '--squash');
    log(
      `auditoría publicada: ${(pc.salida.match(/https:\/\/\S+/) ?? [''])[0]} (${nuevas.length} tareas)`,
    );
    git(repoBase, 'worktree', 'remove', '--force', wt);
    return 'auditoria';
  } catch (e) {
    log(`la auditoría falló: ${e.message}`);
    // un fallo no debe bloquear la auditoría medio día: se reintenta en 1 h
    writeFileSync(
      fichUltima,
      JSON.stringify({
        fecha: new Date(Date.now() - (cfg.auditoria.enfriamientoHoras - 1) * 3600000).toISOString(),
        resultado: 'fallo',
        error: String(e.message).slice(0, 300),
      }),
    );
    return 'auditoria-fallo';
  } finally {
    rmSync(join(dirAud, 'LOCK'), { force: true });
  }
}

// ───────────────────────── un ciclo ─────────────────────────
async function unCiclo(estado) {
  git(repoBase, 'fetch', '-q', 'origin', '--prune');
  if (
    git(repoBase, 'status', '--porcelain').salida.trim() === '' &&
    git(repoBase, 'rev-parse', '--abbrev-ref', 'HEAD').salida.trim() === 'main'
  )
    git(repoBase, 'merge', '--ff-only', 'origin/main');
  prepararCarpeta();
  const prs = prsDelCarril();
  if (!PRUEBA) await repararPrs(estado, prs);

  const { tarea: t, libres } = elegirTarea(prs);
  // Quedan pocas tareas libres: la sesión auditora propone tareas nuevas para que el ciclo no se quede sin trabajo.
  if (
    AUDITAR ||
    (!PRUEBA &&
      !TAREA_FORZADA &&
      libres <= cfg.auditoria.umbralTareasLibres &&
      !enfriada(
        libres === 0 ? cfg.auditoria.enfriamientoSinTareasHoras : cfg.auditoria.enfriamientoHoras,
      ))
  ) {
    log(
      `tareas libres del carril: ${libres} (umbral ${cfg.auditoria.umbralTareasLibres}) → lanzo la auditoría`,
    );
    const r = await auditoria(libres);
    if (AUDITAR) return r;
  }
  const { normales, protegidos } = contarPrs(prs);
  if (!TAREA_FORZADA && normales >= cfg.maxPrsAbiertos) {
    log(`ya hay ${normales} PRs abiertos del carril: espero a que se integren`);
    return 'espera';
  }
  if (!TAREA_FORZADA && protegidos >= cfg.maxPrsProtegidos) {
    log(`ya hay ${protegidos} PRs esperando la aprobación del Owner: espero`);
    return 'espera';
  }
  if (!t) {
    log('no hay tarea libre para este carril');
    return 'sin-tarea';
  }
  const sha = git(repoBase, 'rev-parse', '--short', 'origin/main').salida.trim();
  log(
    `tarea ${t.id} «${t.title}» (origin/main @ ${sha})${PRUEBA ? ' [PRUEBA: no se publica]' : ''}`,
  );
  const { rama, wt } = crearWorktree(t);
  escribirTarea(wt, t, rama, sha);

  // 1) plan → 2) revisión independiente (una segunda oportunidad con sus objeciones)
  let revision = null;
  for (let intento = 1; intento <= 2; intento++) {
    await fase('plan', {
      wt,
      modelo: carril.modeloPlan,
      esperado: () => existsSync(join(wt, 'PLAN.md')),
      mensaje:
        promptPlan(t) +
        (revision?.problemas?.length
          ? `\nEl revisor rechazó el plan anterior por: ${JSON.stringify(revision.problemas)}. Corrígelo.\n`
          : ''),
      t,
    });
    if (!existsSync(join(wt, 'PLAN.md'))) {
      log('la fase de plan no escribió PLAN.md');
      return fallo(estado, t, wt, 'sin PLAN.md');
    }
    await fase('revision', {
      wt,
      modelo: carril.modeloRevisa,
      mensaje: promptRevision(t),
      t,
      esperado: () => existsSync(join(wt, 'REVISION.json')),
    });
    try {
      revision = JSON.parse(readFileSync(join(wt, 'REVISION.json'), 'utf8'));
    } catch {
      revision = {
        veredicto: 'rechazado',
        problemas: ['el revisor no produjo REVISION.json válido'],
      };
    }
    log(
      `revisión del plan: ${revision.veredicto}${revision.problemas?.length ? ' — ' + revision.problemas.join(' | ').slice(0, 300) : ''}`,
    );
    if (revision.veredicto === 'aprobado') break;
    rmSync(join(wt, 'REVISION.json'), { force: true });
  }
  if (revision.veredicto !== 'aprobado')
    return fallo(
      estado,
      t,
      wt,
      'plan rechazado dos veces: ' + (revision.problemas ?? []).join(' | '),
    );

  // 3) implementar → 4) puertas (con una ronda de reparación)
  await fase('implementa', {
    wt,
    modelo: carril.modeloImplementa,
    mensaje: promptImplementa(t, revision),
    t,
    esperado: () => hayCommits(wt) && existsSync(join(wt, 'RESULTADO.md')),
  });
  commitPendiente(wt, t);
  let g = await puertas(wt, rama, t);
  if (
    !g.ok &&
    g.motivos.some((m) =>
      /demasiad|prohibido|cruza de carril|workflows|no toca ninguno|RESULTADO\.md/.test(m),
    )
  ) {
    // Un exceso de tamaño, un cruce de carril o un fichero prohibido NO se arregla con otra ronda del modelo (la «reparación» amplía el cambio: así
    // una tarea de 1159 líneas acabó en 45 ficheros y 8911 líneas). Se descarta; la tarea queda con un intento menos.
    return fallo(estado, t, wt, 'puertas de estructura, sin reparación: ' + g.motivos.join('; '));
  }
  if (!g.ok) {
    log(`puertas fallidas: ${g.motivos.join('; ')}. Una ronda de reparación.`);
    await fase('reparar', {
      wt,
      modelo: carril.modeloImplementa,
      mensaje: promptRepara(t, g.motivos.join('\n') + '\n' + g.salida),
      t,
    });
    commitPendiente(wt, t);
    g = await puertas(wt, rama, t);
  }
  if (!g.ok) return fallo(estado, t, wt, 'puertas: ' + g.motivos.join('; '));
  log(`puertas superadas: ${g.ficheros.length} ficheros`);

  if (PRUEBA) {
    log(`PRUEBA terminada. Worktree conservado en ${wt}; rama ${rama}. Nada se publicó.`);
    return 'prueba';
  }

  // 5) publicar
  const r = publicar(t, rama, wt, g);
  if (!r.ok) return fallo(estado, t, wt, r.detalle);
  log(
    `PR creado: ${r.url} (auto-merge ${r.autoMerge ? 'activado' : 'NO activado'}${r.protegida ? '; espera aprobación del Owner' : ''})`,
  );
  git(repoBase, 'worktree', 'remove', '--force', wt);
  estado.fallosSeguidos = 0;
  estado.ultimaTarea = t.id;
  guardarEstado(estado);
  return 'ok';
}
function fallo(estado, t, wt, motivo) {
  estado.fallosSeguidos += 1;
  estado.ultimaTarea = t.id;
  estado.intentosTarea = estado.intentosTarea ?? {};
  estado.intentosTarea[t.id] = (estado.intentosTarea[t.id] ?? 0) + 1;
  guardarEstado(estado);
  if (!PRUEBA) {
    const sal = join(dir, 'fallos', `${t.id}-${hoy()}`);
    mkdirSync(sal, { recursive: true });
    for (const f of ['PLAN.md', 'REVISION.json', 'RESULTADO.md', 'FASE.md'])
      if (existsSync(join(wt, f))) copyFileSync(join(wt, f), join(sal, f));
    git(repoBase, 'worktree', 'remove', '--force', wt);
  }
  log(
    `CICLO FALLIDO en ${t.id}: ${motivo}. Fallos seguidos: ${estado.fallosSeguidos}. ${PRUEBA ? `Worktree conservado: ${wt}` : 'Artefactos guardados en fallos/'}`,
  );
  writeFileSync(
    join(dir, `fallo-${t.id}.md`),
    `# Fallo en ${t.id}\n\n${ahora()}\n\n${motivo}\n\nWorktree: ${wt}\n`,
  );
  return 'fallo';
}

// ───────────────────────── bucle ─────────────────────────
async function main() {
  if (ELEGIR) {
    git(repoBase, 'fetch', '-q', 'origin', '--prune');
    const prs = prsDelCarril();
    const { tarea: t, libres } = elegirTarea(prs);
    const { normales, protegidos } = contarPrs(prs);
    console.log(
      `carril ${lane}: PRs abiertos = ${normales}/${cfg.maxPrsAbiertos} (+${protegidos} esperando al Owner, tope ${cfg.maxPrsProtegidos}) · tareas libres = ${libres} (umbral de auditoría: ${cfg.auditoria.umbralTareasLibres}, ${enfriada() ? 'en enfriamiento' : 'listo para auditar'})`,
    );
    console.log(
      t
        ? `siguiente tarea: ${t.id} [${t.priority}/${t.effort}] ${t.title}
  ficheros: ${(t.files ?? []).join(', ')}`
        : 'siguiente tarea: ninguna libre',
    );
    return;
  }
  log(
    `supervisor iniciado (carril ${lane}, ${UNA ? 'un ciclo' : 'continuo'}${PRUEBA ? ', PRUEBA' : ''})`,
  );
  for (;;) {
    latido();
    if (stopPedido()) {
      log('fichero STOP presente: me detengo');
      return;
    }
    const estado = leerEstado();
    if (estado.parado) {
      log(
        `parado: ${estado.parado}. Borra «parado» en ${ficheroEstado} y el fichero PARADO.md para reanudar`,
      );
      return;
    }
    if (estado.fallosSeguidos >= cfg.maxFallosSeguidos) {
      estado.parado = `${estado.fallosSeguidos} fallos seguidos`;
      guardarEstado(estado);
      writeFileSync(
        join(dir, 'PARADO.md'),
        `# Ciclo parado\n\n${ahora()}\n\n${estado.fallosSeguidos} fallos seguidos (último en ${estado.ultimaTarea}). Revisa ${join(dir, 'ciclo.log')}.\n`,
      );
      log(`${estado.fallosSeguidos} fallos seguidos: me paro. Ver PARADO.md`);
      return;
    }
    if (!PRUEBA && !UNA && estado.ciclos >= cfg.maxCiclosDia) {
      log(`presupuesto del día agotado (${estado.ciclos}/${cfg.maxCiclosDia}); espero a mañana`);
      await dormir(600);
      continue;
    }
    let resultado;
    try {
      resultado = await unCiclo(estado);
    } catch (e) {
      log(`error inesperado: ${e.stack || e}`);
      resultado = 'fallo';
      estado.fallosSeguidos += 1;
    }
    if (!['sin-tarea', 'espera'].includes(resultado)) {
      const e2 = leerEstado();
      if (!PRUEBA) e2.ciclos += 1;
      e2.fallosSeguidos = Math.max(
        e2.fallosSeguidos,
        resultado === 'fallo' ? estado.fallosSeguidos : 0,
      );
      guardarEstado(e2);
    }
    if (UNA || PRUEBA) return;
    await dormir(
      resultado === 'sin-tarea' || resultado === 'espera'
        ? cfg.pausaSinTareaSeg
        : cfg.pausaEntreCiclosSeg,
    );
  }
}
main().catch((e) => {
  log(`FATAL: ${e.stack || e}`);
  process.exit(1);
});
