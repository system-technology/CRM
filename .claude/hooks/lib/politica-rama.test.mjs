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

import { evaluar } from './politica-rama.mjs';

/** [rama actual, comando, acción esperada, descripción] */
const casos = [
  // --- Lo que debe exigir autorización -------------------------------------
  ['main', 'git commit -m "x"', 'exigir-autorizacion', 'commit en main'],
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

console.log(`\n${casos.length - fallos}/${casos.length} casos correctos.`);
process.exit(fallos === 0 ? 0 : 1);
