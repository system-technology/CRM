#!/usr/bin/env node
/**
 * Las cinco compuertas, en una sola orden y sin tuberías.
 *
 * **Por qué existe.** Antigravity trabaja con un permiso por orden de terminal, y tiene un defecto
 * conocido: **una orden con `|` o con `;` pide aprobación casi siempre**, aunque la regla de la
 * lista de permitidos la cubra. Nuestras órdenes de verificación estaban llenas de `| tail` y
 * `| grep`, así que cada verificación eran cinco interrupciones. Con esto es **una**, y basta una
 * regla —`command(pnpm)`— para que no pregunte nunca más por esto.
 *
 * **Y resuelve de paso la trampa que ya nos mordió tres veces.** `build` va PRIMERO, a propósito:
 * los paquetes del monorepo se compilan a `dist`, y un `dist` viejo hace que `typecheck` compile
 * contra una versión anterior de los contratos. Hemos tenido verdes falsos y rojos falsos por eso.
 * Si se corren en el orden natural —lint, typecheck, test, build— el error ya ocurrió.
 *
 *   pnpm compuertas          las cinco, en orden
 *   pnpm compuertas --rapido sin `build`, para iterar. NO sirve para firmar una entrega
 *
 * Devuelve 0 solo si las cinco pasan. El resumen final dice cuál cayó, para no tener que leer
 * seiscientas líneas de salida buscando el rojo.
 */

import { spawnSync } from 'node:child_process';

const RAPIDO = process.argv.includes('--rapido');

/**
 * `build` va primero. El resto, de lo más barato a lo más caro: si `lint` cae, no tiene sentido
 * esperar a las pruebas.
 */
const COMPUERTAS = [
  { nombre: 'build', orden: ['turbo', 'run', 'build'], omitirEnRapido: true },
  { nombre: 'lint', orden: ['turbo', 'run', 'lint'] },
  { nombre: 'typecheck', orden: ['turbo', 'run', 'typecheck'] },
  { nombre: 'test', orden: ['turbo', 'run', 'test'] },
  {
    nombre: 'format:check',
    orden: ['prettier', '--check', '**/*.{ts,tsx,js,mjs,jsx,json,yml,yaml}'],
  },
];

const resultados = [];

for (const compuerta of COMPUERTAS) {
  if (RAPIDO && compuerta.omitirEnRapido) {
    resultados.push({ nombre: compuerta.nombre, estado: 'omitida' });
    continue;
  }

  console.log(`\n${'─'.repeat(70)}\n  ${compuerta.nombre}\n${'─'.repeat(70)}`);

  const comenzo = Date.now();
  const { status } = spawnSync('pnpm', ['exec', ...compuerta.orden], {
    stdio: 'inherit',
    shell: true,
  });
  const segundos = ((Date.now() - comenzo) / 1000).toFixed(1);

  resultados.push({
    nombre: compuerta.nombre,
    estado: status === 0 ? 'verde' : 'ROJO',
    segundos,
  });

  // Se para en la primera roja: seguir gastaría minutos para contar algo que ya sabemos.
  if (status !== 0) break;
}

console.log(`\n${'═'.repeat(70)}`);
for (const r of resultados) {
  const marca = r.estado === 'verde' ? '✓' : r.estado === 'omitida' ? '·' : '✗';
  const tiempo = r.segundos ? `${r.segundos}s` : '';
  console.log(`  ${marca} ${r.nombre.padEnd(14)} ${r.estado.padEnd(9)} ${tiempo}`);
}

const cayo = resultados.find((r) => r.estado === 'ROJO');
const sinCorrer = COMPUERTAS.length - resultados.length;

if (cayo) {
  console.log(`\n  CAYÓ en «${cayo.nombre}».`);
  if (sinCorrer > 0) {
    console.log(`  Quedaron ${sinCorrer} sin correr: arregla esta y vuelve a lanzarlo.`);
  }
  console.log(
    '\n  Y cuando escribas la entrega: di que cayó. Un informe que esconde un rojo cuesta\n' +
      '  más que el defecto, porque obliga a ejecutarlo todo otra vez.\n',
  );
  process.exit(1);
}

if (RAPIDO) {
  console.log(
    '\n  Modo rápido: `build` NO se ejecutó, así que esto no basta para firmar una entrega.\n' +
      '  Corre `pnpm compuertas` entero antes de escribir `traspaso/ENTREGA.md`.\n',
  );
  process.exit(0);
}

console.log('\n  Las cinco en verde. Ejecutadas, no supuestas.\n');
