#!/usr/bin/env node
/**
 * Hook PostToolUse (Write | Edit) — formatea y revisa lo recién escrito.
 *
 * Por qué existe: para que nadie gaste atención en estilo. Prettier decide, y el agente se ocupa
 * de lo que importa. Además avisa de dos cosas que en este proyecto son defectos reales:
 * una tabla nueva sin política RLS, y un módulo que importa directamente de otro.
 *
 * No bloquea nunca: avisa. Si falla, falla en silencio — un hook roto no puede frenar el trabajo.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let datos;
try {
  datos = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const ruta = datos.tool_input?.file_path;
if (!ruta || !existsSync(ruta)) process.exit(0);

const avisos = [];

// --- 1. Formateo automático ------------------------------------------------
if (/\.(ts|tsx|js|jsx|mjs|json|md|ya?ml)$/.test(ruta)) {
  try {
    execFileSync('npx', ['--no-install', 'prettier', '--write', ruta], {
      stdio: 'ignore',
      timeout: 20_000,
      shell: process.platform === 'win32',
    });
  } catch {
    // Prettier aún no instalado (Fase 0) o falló: no es motivo para interrumpir.
  }
}

// --- 2. Revisiones propias del proyecto ------------------------------------
let contenido = '';
try {
  contenido = readFileSync(ruta, 'utf8');
} catch {
  process.exit(0);
}

// Migración o esquema que crea una tabla sin dejar rastro de política RLS.
if (/\.(sql|prisma)$/.test(ruta)) {
  const creaTabla = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["\w.]+/i.test(contenido) ||
    /^\s*model\s+\w+\s*\{/m.test(contenido);
  const mencionaRls = /ROW LEVEL SECURITY|tenant_isolation|tenantId|tenant_id/i.test(contenido);
  if (creaTabla && !mencionaRls) {
    avisos.push(
      'Se creó una tabla o modelo sin rastro de `tenant_id` ni de política RLS. ' +
        'Regla R1 de CLAUDE.md: toda tabla de negocio lleva `tenant_id` y política RLS con ' +
        '`WITH CHECK`. Si es una tabla global de plataforma, documéntala como excepción en ' +
        'docs/02-arquitectura/03-modelo-de-datos.md.',
    );
  }
}

// Importación directa entre módulos: erosiona la frontera del monolito modular (regla R4).
const moduloActual = ruta.match(/modules[\\/]([\w-]+)[\\/]/)?.[1];
if (moduloActual) {
  const importaciones = [...contenido.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const cruzados = importaciones
    .map((i) => i.match(/modules[\\/]([\w-]+)/)?.[1])
    .filter((m) => m && m !== moduloActual);
  if (cruzados.length > 0) {
    avisos.push(
      `Importación directa desde el módulo '${moduloActual}' hacia '${[...new Set(cruzados)].join(", ")}'. ` +
        'Regla R4 de CLAUDE.md: los módulos se comunican por eventos de dominio o por puertos ' +
        'explícitos, no por importación directa. Es lo que permitirá extraer servicios después.',
    );
  }
}

// `any` explícito en TypeScript.
if (/\.tsx?$/.test(ruta) && /:\s*any\b|<any>|as\s+any\b/.test(contenido)) {
  avisos.push(
    'Hay un `any` explícito. Si el tipo es desconocido, usa `unknown` y valida con Zod. ' +
      'Un `any` suele ser señal de que el modelo de datos está incompleto.',
  );
}

if (avisos.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Revisión automática de \`${ruta}\`:\n- ${avisos.join('\n- ')}`,
      },
    }),
  );
}

process.exit(0);
