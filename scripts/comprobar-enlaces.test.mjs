/**
 * Pruebas de `comprobar-enlaces.mjs` con un árbol temporal: cada caso es una forma de enlace que
 * el comprobador debe aceptar, rechazar o tolerar por estar en la línea base.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { comprobar, contar, nuevas } from './comprobar-enlaces.mjs';

function arbol(archivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'enlaces-'));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completa = join(raiz, ruta);
    mkdirSync(dirname(completa), { recursive: true });
    writeFileSync(completa, contenido);
  }
  return raiz;
}

const raiz = arbol({
  'docs/a.md': [
    '[valido](b.md) y [con ancla](b.md#seccion) y [solo ancla](#arriba)',
    '[externo](https://ejemplo.com/x) y [correo](mailto:a@b.co)',
    '[roto nuevo](no-existe.md)',
    '[roto viejo](antiguo.md)',
    'Mención válida `docs/b.md` y mención en prosa `docs/b.md:12`.',
    'Mención rota `docs/fantasma.md` y patrón `docs/_bitacora/AAAA-MM-DD-<tema>.md`.',
    'Nombre de rama `docs/adr-0009-parametrico` no es una ruta.',
    '```',
    '[dentro de código](nada.md) `docs/ni-esto.md`',
    '```',
  ].join('\n'),
  'docs/b.md': '# B\n',
  'docs/sub/c.md': '[sube](../b.md) [sube de más](../../../fuera.md)\n',
});

const rotas = comprobar(raiz, ['docs/a.md', 'docs/b.md', 'docs/sub/c.md']);
const destinos = rotas.map((r) => `${r.archivo} -> ${r.destino}`);

assert.deepEqual(
  destinos.sort(),
  [
    'docs/a.md -> antiguo.md',
    'docs/a.md -> docs/fantasma.md',
    'docs/a.md -> no-existe.md',
    'docs/sub/c.md -> ../../../fuera.md',
  ],
  'solo debe romper lo que no existe: ni anclas, ni URL, ni código, ni patrones, ni ramas',
);

// Con la línea base: lo viejo se tolera y lo nuevo falla.
const base = { 'docs/a.md -> antiguo.md': 1, 'docs/a.md -> docs/fantasma.md': 1 };
const soloNuevas = nuevas(rotas, base).map((r) => r.destino);
assert.deepEqual(soloNuevas.sort(), ['../../../fuera.md', 'no-existe.md']);

// Una rotura viejísima que se repite una vez más SÍ cuenta como nueva.
const repetida = [...rotas, rotas[0]];
assert.equal(nuevas(repetida, contar(rotas)).length, 1);

// Sin roturas nuevas respecto de una base completa: salida limpia.
assert.equal(nuevas(rotas, contar(rotas)).length, 0);

console.log('comprobar-enlaces: todas las pruebas pasan');
