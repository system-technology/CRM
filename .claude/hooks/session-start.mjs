#!/usr/bin/env node
/**
 * Hook SessionStart — inyecta el hilo del proyecto al abrir una sesión.
 *
 * Por qué existe: ningún modelo recuerda la sesión anterior. Este hook garantiza que toda
 * sesión arranque sabiendo en qué fase está el proyecto, qué sigue y qué está bloqueado,
 * sin depender de que alguien se acuerde de decirlo.
 *
 * Salida: JSON con `hookSpecificOutput.additionalContext`, que se añade al contexto inicial.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();

function leerSeguro(ruta) {
  try {
    return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
  } catch {
    return null;
  }
}

/** Extrae de ESTADO.md la cabecera y las secciones que de verdad importan al arrancar. */
function resumirEstado(contenido) {
  if (!contenido) return null;
  const secciones = ['## 1. Dónde estamos', '## 3. Qué sigue', '## 4. Bloqueos'];
  const partes = [];
  for (const marca of secciones) {
    const inicio = contenido.indexOf(marca);
    if (inicio === -1) continue;
    const resto = contenido.slice(inicio);
    const siguiente = resto.indexOf('\n## ', 4);
    partes.push(siguiente === -1 ? resto : resto.slice(0, siguiente));
  }
  return partes.join('\n\n').trim() || null;
}

/** Última entrada de bitácora, por nombre de archivo (empiezan con la fecha ISO). */
function ultimaBitacora() {
  const dir = join(raiz, 'docs', '_bitacora');
  if (!existsSync(dir)) return null;
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .reverse();
  return archivos[0] ?? null;
}

/** Advierte si ESTADO.md lleva demasiado sin tocarse: síntoma de hilo roto. */
function diasDesdeActualizacion(ruta) {
  try {
    const dias = (Date.now() - statSync(ruta).mtimeMs) / 86_400_000;
    return Math.floor(dias);
  } catch {
    return null;
  }
}

const rutaEstado = join(raiz, 'ESTADO.md');
const estado = leerSeguro(rutaEstado);
const resumen = resumirEstado(estado);
const bitacora = ultimaBitacora();
const dias = diasDesdeActualizacion(rutaEstado);

const lineas = ['# Hilo del proyecto (inyectado automáticamente al iniciar la sesión)'];

if (resumen) {
  lineas.push(resumen);
} else {
  lineas.push(
    'No se encontró ESTADO.md o no tiene el formato esperado. Antes de trabajar, revísalo: es la ' +
      'única fuente de verdad sobre en qué punto está el proyecto.',
  );
}

if (bitacora) {
  lineas.push(`\n**Última entrada de bitácora:** \`docs/_bitacora/${bitacora}\``);
}

if (dias !== null && dias > 14) {
  lineas.push(
    `\n⚠️ ESTADO.md no se actualiza hace ${dias} días. Verifica contra \`git log\` si la ` +
      'documentación todavía refleja la realidad antes de confiar en ella.',
  );
}

lineas.push(
  '\n**Recordatorio:** al cerrar esta sesión, actualiza `ESTADO.md` y deja entrada en ' +
    '`docs/_bitacora/`. Usa `/estado`. Lo que no quede escrito, se pierde.',
);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lineas.join('\n'),
    },
  }),
);
