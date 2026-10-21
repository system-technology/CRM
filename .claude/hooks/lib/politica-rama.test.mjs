#!/usr/bin/env node
/**
 * Pruebas de la política de protección de rama.
 *
 *   node .claude/hooks/lib/politica-rama.test.mjs
 *
 * Existe porque el guardián produjo un falso positivo en producción: estando en `main`,
 * bloqueaba `git push origin --delete <otra-rama>`, que no escribe en la rama protegida.
 * Un guardián que bloquea lo legítimo acaba desactivado, y entonces no protege nada.
 */

import { directorioDelComando, evaluar } from './politica-rama.mjs';

/** [rama actual, comando, acción esperada, descripción] */
const casos = [
  // --- Lo que debe exigir autorización -------------------------------------
  ['main', 'git commit -m "x"', 'exigir-autorizacion', 'commit en main'],
  ['main', 'git -C ../gate commit -m x', 'exigir-autorizacion', 'commit con -C en main'],
  ['main', 'git commit --allow-empty -m "x"', 'exigir-autorizacion', 'commit vacío en main'],
  ['main', 'git merge --no-ff feat/x', 'exigir-autorizacion', 'merge en main'],
  ['main', 'git push', 'exigir-autorizacion', 'push sin refspec desde main'],
  ['main', 'git push origin main', 'exigir-autorizacion', 'push explícito a main'],
  ['main', 'git push -u origin main', 'exigir-autorizacion', 'push con -u a main'],
  ['main', 'git push origin --delete main', 'exigir-autorizacion', 'borrar main en el remoto'],
  ['feat/x', 'git push origin main', 'exigir-autorizacion', 'push a main desde otra rama'],

  // --- Lo que debe bloquearse siempre --------------------------------------
  ['main', 'git push --force origin main', 'bloquear-destructivo', 'force push a main'],
  ['main', 'git push -f', 'bloquear-destructivo', 'force push corto desde main'],
  ['main', 'git reset --hard HEAD~1', 'bloquear-destructivo', 'reset duro en main'],
  ['feat/x', 'git branch -D main', 'bloquear-destructivo', 'borrado forzado de main'],

  // --- Lo que NO debe bloquearse (los falsos positivos) --------------------
  ['main', 'git push origin --delete feat/x', 'permitir', 'borrar OTRA rama estando en main'],
  ['main', 'git push origin feat/x', 'permitir', 'push de OTRA rama estando en main'],
  ['main', 'git push origin :feat/x', 'permitir', 'borrado con dos puntos de otra rama'],
  ['main', 'git checkout -b feat/x', 'permitir', 'crear rama desde main'],
  ['main', 'git status', 'permitir', 'lectura'],
  ['main', 'git log --oneline -5', 'permitir', 'historial'],
  ['main', 'git tag -a v0.1.0 -m "x"', 'permitir', 'etiquetar'],
  ['main', 'ls -la', 'permitir', 'comando que no es git'],
  ['feat/x', 'git commit -m "x"', 'permitir', 'commit en rama de trabajo'],
  ['feat/x', 'git push origin feat/x', 'permitir', 'push de rama de trabajo'],
  ['feat/x', 'git push', 'permitir', 'push sin refspec desde rama de trabajo'],
  ['feat/x', 'git merge main', 'permitir', 'traer main a la rama de trabajo'],

  // --- Texto libre que menciona main (segundo falso positivo encontrado) ---
  [
    'feat/x',
    'git commit -m "docs: esta rama no se integra a main hasta que compile"',
    'permitir',
    'commit cuyo MENSAJE menciona main',
  ],
  ['feat/x', 'git push -u origin feat/x', 'permitir', 'push de rama de trabajo con -u'],
  [
    'feat/x',
    "git commit -m 'fix: corrige la guarda de main' && git push origin feat/x",
    'permitir',
    'commit con main en el mensaje, seguido de push de otra rama',
  ],
  [
    'feat/x',
    "git commit -F - <<'MSG'\nfeat: algo\n\nEsta rama no se integra a main todavía.\nMSG\ngit log --oneline -1",
    'permitir',
    'mensaje en heredoc que menciona main',
  ],
  [
    'feat/x',
    'git commit -m "wip" && git push origin main',
    'exigir-autorizacion',
    'el push real a main sigue detectándose pese al mensaje',
  ],
  [
    'feat/x',
    'git push origin "main"',
    'exigir-autorizacion',
    'push a main con la rama entrecomillada',
  ],

  // --- Tercer falso positivo: texto que PARECE un comando ------------------
  [
    'feat/x',
    'for p in "git push" "main"; do grep -ril "$p" .; done',
    'permitir',
    'patrones de busqueda entrecomillados que mencionan git push y main',
  ],
  ['main', 'echo "no hagas git commit en main"', 'permitir', 'echo que menciona un comando git'],
  [
    'main',
    "grep -rn 'git push origin main' docs/",
    'permitir',
    'buscar literalmente un comando peligroso en la documentacion',
  ],
  [
    'feat/x',
    'node -e "console.log(\'git push origin main\')"',
    'permitir',
    'script que imprime un comando git',
  ],

  // --- Prefijos y formas de refspec ----------------------------------------
  [
    'feat/x',
    'timeout 60 git push origin main',
    'exigir-autorizacion',
    'push a main con prefijo timeout',
  ],
  ['feat/x', 'git push origin HEAD:main', 'exigir-autorizacion', 'push con refspec HEAD:main'],
  ['feat/x', 'git push origin refs/heads/main', 'exigir-autorizacion', 'push con ref completa'],
  ['feat/x', 'git push origin feat/x:feat/x', 'permitir', 'refspec de otra rama'],
  ['main', 'git fetch origin && git status', 'permitir', 'lecturas encadenadas en main'],
  [
    'main',
    'git checkout -b feat/y && git commit -m "x"',
    'exigir-autorizacion',
    'conservador: no simula que la rama cambia a mitad del comando',
  ],
];

let fallos = 0;

for (const [rama, cmd, esperada, descripcion] of casos) {
  const { accion } = evaluar(cmd, rama);
  const ok = accion === esperada;
  if (!ok) fallos++;
  console.log(
    `${ok ? 'OK   ' : 'FALLA'} [${rama.padEnd(6)}] ${descripcion.padEnd(42)} → ${accion}` +
      (ok ? '' : `  (se esperaba: ${esperada})`),
  );
}

// ---------------------------------------------------------------------------
// Directorio sobre el que actúa el comando — necesario desde que hay worktrees.
//
// El caso que importa no es el falso positivo (trabajar en un worktree y quedar
// bloqueado porque la carpeta de la sesión está en `main`), sino el inverso: sesión
// en una rama de trabajo y `cd` a un worktree que tiene `main`. Mirando la rama de
// la sesión, el guardián dejaría pasar una escritura en la rama protegida.
// ---------------------------------------------------------------------------
const casosDirectorio = [
  ['cd /d/Projects/CRM-api && git commit -m x', '/d/Projects/CRM-api'],
  ['cd "/ruta con espacios" && git commit', '/ruta con espacios'],
  ['cd .. && git merge main', '..'],
  ['git commit -m x', null],
  ['cd', null],
  ['cd - && git status', null],
  ['cd ~/otro && git push', null],
  ['git status && cd /otro', null],
  ['git -C /d/Projects/CRM-gate merge x', '/d/Projects/CRM-gate'],
  ['git -C "../mi gate" commit -m x', '../mi gate'],
  ['git status && git -C ../g push', '../g'],
  ['git commit -m "-C /x"', null],
];

for (const [entrada, esperado] of casosDirectorio) {
  const real = directorioDelComando(entrada);
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(
    `${ok ? 'OK   ' : 'FALLA'} [cd    ] ${JSON.stringify(entrada).padEnd(42)} → ${JSON.stringify(real)}`,
  );
}

// --- Worktrees reales: marcador de autorizacion y guardia ------------------------------------
// En un worktree `.git` es un archivo. Antes: autorizar-integracion fallaba (ENOTDIR) y el
// guardia no alcanzaba a git -C. Se prueba con un repo temporal; el main real no se toca.
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const AUTORIZAR = join(aqui, '..', 'autorizar-integracion.mjs');
const GUARD = join(aqui, '..', 'guard-rama.mjs');
const g = (cwd, ...a) =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const comprobar = (desc, ok) => {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} [wtree ] ${desc}`);
};
const guardia = (sesion, comando) =>
  spawnSync('node', [GUARD], {
    cwd: sesion,
    input: JSON.stringify({ tool_input: { command: comando } }),
    encoding: 'utf8',
  }).status;

const raiz = mkdtempSync(join(tmpdir(), 'wt-guard-'));
let totalWt = 0;
try {
  const repo = join(raiz, 'repo');
  // Barras normales: el tokenizador trata la barra invertida como escape.
  const gate = join(raiz, 'gate').replaceAll(String.fromCharCode(92), '/');
  const otro = join(raiz, 'otro');
  mkdirSync(repo);
  g(repo, 'init', '-q', '-b', 'trabajo');
  g(repo, '-c', 'user.email=a@b', '-c', 'user.name=x', 'commit', '-q', '--allow-empty', '-m', 'i');
  g(repo, 'branch', 'main');
  g(repo, 'worktree', 'add', '-q', gate, 'main'); // gate tiene main; la sesion (repo) no
  g(repo, 'worktree', 'add', '-q', '-b', 'otra', otro);

  const r1 = spawnSync('node', [AUTORIZAR, 'prueba'], { cwd: gate, encoding: 'utf8' });
  comprobar('autorizar-integracion funciona en un worktree (.git es archivo)', r1.status === 0);

  // Sesion en rama de trabajo, comando contra el worktree con main: debe estar autorizado
  // (marcador del gate) y consumirse.
  comprobar(
    'git -C <gate> merge pasa con la autorizacion del gate',
    guardia(repo, `git -C ${gate} merge x`) === 0,
  );
  comprobar('la autorizacion es de un solo uso', guardia(repo, `git -C ${gate} merge x`) === 2);

  // Una autorizacion del gate no sirve a otro worktree: la del gate se pide, y desde otro
  // worktree (sin autorizacion propia) el mismo comando contra el gate sigue siendo del gate.
  // Lo que se prueba aqui es lo inverso: una pedida en 'otro' no habilita al gate.
  spawnSync('node', [AUTORIZAR, 'prueba'], { cwd: otro, encoding: 'utf8' }); // marcador de 'otro'
  comprobar(
    'autorizacion pedida desde otro worktree no sirve para el gate',
    guardia(repo, `git -C ${gate} commit -m x`) === 2,
  );
  comprobar('en rama de trabajo, git commit normal pasa', guardia(otro, 'git commit -m x') === 0);
  comprobar(
    'git -C <gate> push --force siempre se frena',
    guardia(repo, `git -C ${gate} push --force`) === 2,
  );
  totalWt = 6;
} finally {
  rmSync(raiz, { recursive: true, force: true });
}

const total = casos.length + casosDirectorio.length + totalWt;
console.log(`\n${total - fallos}/${total} casos correctos.`);
process.exit(fallos === 0 ? 0 : 1);
