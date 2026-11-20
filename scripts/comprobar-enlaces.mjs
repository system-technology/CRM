#!/usr/bin/env node
/**
 * Comprueba que los enlaces y las rutas citadas en la documentación apuntan a algo que existe.
 *
 * Existe porque la documentación es la memoria del sistema (CLAUDE.md §9) y nada la vigilaba:
 * al mover un documento, los enlaces que lo citaban se rompían en silencio. Antes de reorganizar
 * `docs/` hace falta poder ver qué se rompe (T-302).
 *
 * Qué mira, en cada `*.md` versionado:
 *   1. Enlaces markdown `](ruta)`, resueltos relativos al archivo que los contiene.
 *   2. Menciones en backticks de rutas del repo (`docs/...`, `traspaso/...`, `apps/...`,
 *      `packages/...`), resueltas desde la raíz del repo.
 *
 * Qué ignora: URL externas (`http:`, `https:`, `mailto:`), anclas (`#...`), los bloques de código
 * con cercas (``` o ~~~: ahí hay ejemplos, no promesas) y las menciones con comodines o marcadores
 * (`*`, `<tema>`, `AAAA-MM-DD`, `...`), que describen un patrón y no un archivo.
 *
 * Línea base: `scripts/enlaces-rotos.base.json` registra las roturas que ya existían el día que se
 * añadió el comprobador. Por defecto el script falla SOLO por roturas nuevas respecto de ella: así
 * una rotura vieja no tapa una nueva, y la base solo puede encogerse. `--escribir-base` la
 * regenera con lo que haya hoy (hacerlo a propósito, nunca para silenciar una rotura nueva).
 *
 * La clave de una rotura es `archivo` + `destino` (sin número de línea) para que editar el texto
 * de alrededor no convierta una rotura vieja en «nueva».
 *
 * Solo mira archivos `.md`: las menciones en `.yml` o `.mjs` (p. ej. `docs/FLUJO.md` en
 * `ownership.yml`) quedan fuera de su alcance.
 *
 * Solo usa la biblioteca estándar: corre en CI sin instalar nada.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIJOS_DEL_REPO = ['docs/', 'traspaso/', 'apps/', 'packages/'];
const EXCLUIDOS = [/(^|\/)node_modules\//, /^\.claude\/worktrees\//];
const BASE_POR_DEFECTO = join(dirname(fileURLToPath(import.meta.url)), 'enlaces-rotos.base.json');

/** Archivos `.md` versionados, sin dependencias de terceros ni worktrees de agentes. */
export function listarMarkdown(raiz) {
  const salida = execFileSync('git', ['ls-files', '*.md'], { cwd: raiz, encoding: 'utf8' });
  return salida
    .split('\n')
    .filter(Boolean)
    .filter((f) => !EXCLUIDOS.some((re) => re.test(f)));
}

/** Líneas del texto que no están dentro de un bloque con cercas. Devuelve [{ n, texto }]. */
function lineasFueraDeCodigo(texto) {
  const lineas = [];
  let cerca = null;
  texto.split('\n').forEach((linea, i) => {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(linea);
    if (m) {
      const marca = m[1][0];
      if (cerca === null) cerca = marca;
      else if (cerca === marca) cerca = null;
      return;
    }
    if (cerca === null) lineas.push({ n: i + 1, texto: linea });
  });
  return lineas;
}

const ES_EXTERNO = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const TIENE_MARCADOR = /[*<>{}|…]|\.\.\.|AAAA|MM-DD|\bXXX/;
/** Archivos locales a propósito (`.gitignore`): citarlos no es una promesa de que estén en el repo. */
const ES_LOCAL = /\.local\.|\/_local\/|\.env(\.|$)/;
/** Una ruta de `docs/` con extensión o barra final; sin ellas suele ser un nombre de rama. */
const PARECE_RUTA_DE_DOCS = /\.[a-z0-9]+$|\/$/i;

/** Quita ancla, consulta y sufijo `:línea` de una ruta. */
function limpiar(ruta, esMencion) {
  const sinSufijos = ruta.replace(/[#?].*$/, '').replace(/:\d[\d,:-]*$/, '');
  // La puntuación final solo sobra en una mención en prosa; en un enlace es parte del destino.
  return esMencion ? sinSufijos.replace(/[.,;:)]+$/, '') : sinSufijos;
}

function decodificar(ruta) {
  try {
    return decodeURI(ruta);
  } catch {
    return ruta;
  }
}

/** Referencias de un archivo: [{ linea, destino, tipo, ruta }] con `ruta` relativa a la raíz. */
export function extraerReferencias(archivo, texto) {
  const refs = [];
  const dirArchivo = posix.dirname(archivo);
  for (const { n, texto: linea } of lineasFueraDeCodigo(texto)) {
    // 1. Enlaces markdown: `[a](b)` y `![a](b)`, con título opcional.
    for (const m of linea.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const crudo = m[1];
      if (!crudo || crudo.startsWith('#') || ES_EXTERNO.test(crudo)) continue;
      const destino = limpiar(crudo, false);
      if (!destino) continue;
      const ruta = destino.startsWith('/')
        ? posix.normalize(destino.slice(1))
        : posix.normalize(posix.join(dirArchivo, decodificar(destino)));
      refs.push({ linea: n, destino: crudo, tipo: 'enlace', ruta });
    }
    // 2. Menciones en backticks de rutas del repo.
    for (const m of linea.matchAll(/`([^`\n]+)`/g)) {
      const crudo = m[1].trim();
      if (!PREFIJOS_DEL_REPO.some((p) => crudo.startsWith(p)) || /\s/.test(crudo)) continue;
      if (TIENE_MARCADOR.test(crudo) || ES_LOCAL.test(crudo)) continue;
      const destino = limpiar(crudo, true);
      if (!destino) continue;
      if (destino.startsWith('docs/') && !PARECE_RUTA_DE_DOCS.test(destino)) continue;
      refs.push({ linea: n, destino: crudo, tipo: 'mencion', ruta: posix.normalize(destino) });
    }
  }
  return refs;
}

/** Todas las roturas: [{ archivo, linea, destino, tipo }]. */
export function comprobar(raiz, archivos) {
  const rotas = [];
  for (const archivo of archivos) {
    const texto = readFileSync(join(raiz, archivo), 'utf8');
    for (const ref of extraerReferencias(archivo, texto)) {
      const fuera = ref.ruta === '..' || ref.ruta.startsWith('../');
      if (fuera || !existsSync(join(raiz, ref.ruta))) {
        rotas.push({ archivo, linea: ref.linea, destino: ref.destino, tipo: ref.tipo });
      }
    }
  }
  return rotas;
}

const clave = (r) => `${r.archivo} -> ${r.destino}`;

/** Agrupa roturas por clave con su número de veces: { clave: veces }. */
export function contar(rotas) {
  const cuenta = {};
  for (const r of rotas) cuenta[clave(r)] = (cuenta[clave(r)] ?? 0) + 1;
  return cuenta;
}

/** Roturas que superan lo registrado en la línea base (`{ clave: veces }`). */
export function nuevas(rotas, base) {
  const vistas = {};
  const resultado = [];
  for (const r of rotas) {
    const k = clave(r);
    vistas[k] = (vistas[k] ?? 0) + 1;
    if (vistas[k] > (base[k] ?? 0)) resultado.push(r);
  }
  return resultado;
}

export function leerBase(ruta) {
  if (!existsSync(ruta)) return {};
  return JSON.parse(readFileSync(ruta, 'utf8')).roturas ?? {};
}

export function escribirBase(ruta, rotas) {
  const ordenado = Object.fromEntries(
    Object.entries(contar(rotas)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const contenido = {
    _doc:
      'Roturas de enlaces que ya existían al añadir scripts/comprobar-enlaces.mjs (T-302). ' +
      'Solo debe encogerse: al arreglar un enlace, regenerar con `pnpm docs:enlaces --escribir-base`. ' +
      'Clave: archivo -> destino tal como está escrito; valor: cuántas veces aparece.',
    roturas: ordenado,
  };
  writeFileSync(ruta, JSON.stringify(contenido, null, 2) + '\n');
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const args = process.argv.slice(2);
  const raiz = process.cwd();
  const rotas = comprobar(raiz, listarMarkdown(raiz));
  if (args.includes('--escribir-base')) {
    escribirBase(BASE_POR_DEFECTO, rotas);
    console.log(`Línea base escrita: ${rotas.length} roturas en ${BASE_POR_DEFECTO}`);
    process.exit(0);
  }
  const base = leerBase(BASE_POR_DEFECTO);
  const roturasNuevas = nuevas(rotas, base);
  if (roturasNuevas.length > 0) {
    for (const r of roturasNuevas) {
      console.error(`::error file=${r.archivo},line=${r.linea}::${r.tipo} roto: ${r.destino}`);
    }
    console.error(
      `\n${roturasNuevas.length} enlace(s) o ruta(s) rotos nuevos. Si moviste un documento, ` +
        'actualiza quienes lo citan. Las roturas anteriores están en scripts/enlaces-rotos.base.json.',
    );
    process.exit(1);
  }
  console.log(
    `Sin roturas nuevas (${rotas.length} conocidas en la línea base, ${Object.keys(base).length} claves).`,
  );
}
