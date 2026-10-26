#!/usr/bin/env node
// Estado de sincronía de TODOS los árboles de trabajo (git worktrees) frente a origin/main.
//
//   node scripts/estado-de-arboles.mjs            informe
//   node scripts/estado-de-arboles.mjs --actualizar   además pone al día `main` en los árboles limpios que estén en main
//
// Por qué existe: cada integración deja atrás a quien trabaja en una rama vieja, y eso produjo ramas que
// arrastran cosas ya integradas, PRs en conflicto y trabajo duplicado. Esto lo hace visible en un comando.
// Solo lee; con --actualizar solo hace `git pull --ff-only` en árboles que están en `main` y sin cambios.
import { execFileSync } from 'node:child_process';

const ACTUALIZAR = process.argv.includes('--actualizar');
const git = (cwd, ...a) => {
  try {
    return execFileSync('git', a, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const raiz = git(process.cwd(), 'rev-parse', '--show-toplevel');
if (!raiz) {
  console.error('Esto no es un repositorio git.');
  process.exit(2);
}
git(raiz, 'fetch', '-q', 'origin', '--prune');

const arboles = git(raiz, 'worktree', 'list', '--porcelain')
  .split('\n\n')
  .map((bloque) => {
    const l = bloque.split('\n');
    const ruta = (l.find((x) => x.startsWith('worktree ')) ?? '').slice(9);
    const rama =
      (l.find((x) => x.startsWith('branch ')) ?? '').replace('branch refs/heads/', '') ||
      '(desprendido)';
    return { ruta, rama: rama.replace(/^refs\/heads\//, '') };
  })
  .filter((a) => a.ruta);

const filas = arboles.map((a) => {
  const [atras, adelante] = (
    git(a.ruta, 'rev-list', '--left-right', '--count', 'origin/main...HEAD') || '0\t0'
  )
    .split(/\s+/)
    .map(Number);
  const sucios = git(a.ruta, 'status', '--porcelain').split('\n').filter(Boolean).length;
  const ultimo = git(a.ruta, 'log', '-1', '--format=%cr') || '?';
  let estado = 'al día';
  if (atras > 0 && adelante === 0 && sucios === 0) estado = 'ATRASADO (se puede avanzar)';
  else if (atras > 0) estado = 'ATRASADO';
  if (sucios > 0) estado += ' · CAMBIOS SIN GUARDAR';
  return { ...a, atras, adelante, sucios, ultimo, estado };
});

console.log(`origin/main @ ${git(raiz, 'rev-parse', '--short', 'origin/main')}\n`);
for (const f of filas) {
  console.log(
    `${f.estado.padEnd(34)} ${String(f.atras).padStart(3)} atrás ${String(f.adelante).padStart(3)} adelante  ${f.rama.padEnd(46)} ${f.ultimo.padEnd(16)} ${f.ruta}`,
  );
  if (ACTUALIZAR && f.rama === 'main' && f.atras > 0 && f.sucios === 0) {
    git(f.ruta, 'pull', '--ff-only', '-q');
    console.log('   → main puesto al día');
  }
}
const atrasados = filas.filter((f) => f.atras > 0).length;
console.log(`\n${filas.length} árboles; ${atrasados} atrasados respecto a main.`);
process.exit(atrasados > 0 ? 1 : 0);
