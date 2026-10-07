#!/usr/bin/env node
/**
 * Diagnóstico del entorno de desarrollo.
 *
 *   pnpm preflight
 *
 * Convierte "falla algo raro" en "haz exactamente esto". Nació de una sesión en la que se
 * perdieron varias vueltas diagnosticando a mano: Node fuera de soporte, pnpm sin atajo,
 * el .env apuntando a otro sitio del que se creía, una cadena agrupada donde iba la directa.
 *
 * NUNCA imprime credenciales: de las cadenas de conexión solo muestra usuario y host.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const VERDE = '\x1b[32m',
  ROJO = '\x1b[31m',
  AMARILLO = '\x1b[33m',
  GRIS = '\x1b[90m',
  FIN = '\x1b[0m';
const OK = `${VERDE}OK  ${FIN}`;
const MAL = `${ROJO}MAL ${FIN}`;
const AVISO = `${AMARILLO}AVISO${FIN}`;

const problemas = [];
const avisos = [];

function linea(estado, titulo, detalle = '') {
  console.log(`  ${estado}  ${titulo}${detalle ? `  ${GRIS}${detalle}${FIN}` : ''}`);
}

function comando(cmd, args) {
  try {
    // En Windows los lanzadores de npm son .cmd y execFileSync no los resuelve sin shell.
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    }).trim();
  } catch {
    return null;
  }
}

console.log('\nEntorno de desarrollo de ViajaPro\n');

// --- Node ----------------------------------------------------------------
const requerida = existsSync('.nvmrc') ? readFileSync('.nvmrc', 'utf8').trim() : null;
const actual = process.versions.node;
const [maj, min] = actual.split('.').map(Number);
const finDeSoporte = { 18: '2025-04-30', 20: '2026-04-30', 22: '2027-04-30', 24: '2028-04-30' };
const hoy = new Date().toISOString().slice(0, 10);

if (finDeSoporte[maj] && finDeSoporte[maj] < hoy) {
  linea(MAL, `Node ${actual}`, `fuera de soporte desde ${finDeSoporte[maj]}`);
  problemas.push(
    `Node ${maj} no recibe parches de seguridad.\n     nvm install ${requerida} && nvm use ${requerida}`,
  );
} else if (
  requerida &&
  (maj < Number(requerida.split('.')[0]) ||
    (maj === Number(requerida.split('.')[0]) && min < Number(requerida.split('.')[1])))
) {
  linea(MAL, `Node ${actual}`, `el proyecto fija ${requerida}`);
  problemas.push(
    `Versión de Node por debajo de la fijada.\n     nvm install ${requerida} && nvm use ${requerida}`,
  );
} else {
  linea(OK, `Node ${actual}`, requerida ? `fijada ${requerida}` : '');
}

// --- pnpm ----------------------------------------------------------------
const pnpmDirecto = comando('pnpm', ['--version']);
const pnpmCorepack = comando('corepack', ['pnpm', '--version']);

if (pnpmDirecto) {
  linea(OK, `pnpm ${pnpmDirecto}`);
} else if (pnpmCorepack) {
  linea(AVISO, `pnpm ${pnpmCorepack}`, 'solo vía corepack, sin atajo en el PATH');
  avisos.push(
    'pnpm funciona con "corepack pnpm ..." pero no como comando suelto.\n' +
      '     Para el atajo, una vez en una terminal COMO ADMINISTRADOR: corepack enable',
  );
} else {
  linea(MAL, 'pnpm', 'no disponible');
  problemas.push('pnpm no está.\n     corepack enable && corepack prepare pnpm@9.12.0 --activate');
}

// --- Dependencias --------------------------------------------------------
linea(
  existsSync('node_modules') ? OK : MAL,
  'Dependencias',
  existsSync('node_modules') ? '' : 'falta pnpm install',
);
if (!existsSync('node_modules')) problemas.push('Dependencias sin instalar.\n     pnpm install');

// --- .env ----------------------------------------------------------------
if (!existsSync('.env')) {
  linea(MAL, '.env', 'no existe');
  problemas.push('Falta el archivo de entorno.\n     cp .env.example .env  y completar');
} else {
  const activas = {};
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .forEach((l) => {
      if (/^\s*#/.test(l)) return;
      const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/);
      if (m) activas[m[1]] = m[2].trim();
    });

  const describir = (valor) => {
    try {
      const u = new URL(valor);
      return { usuario: u.username, host: u.hostname };
    } catch {
      return null;
    }
  };

  for (const [clave, debePooler] of [
    ['DATABASE_URL', false],
    ['DIRECT_URL', false],
    ['DATABASE_APP_URL', true],
  ]) {
    const valor = activas[clave];
    if (!valor) {
      linea(MAL, clave, 'no definida');
      problemas.push(`${clave} no está definida en .env.`);
      continue;
    }
    const d = describir(valor);
    if (!d) {
      linea(MAL, clave, 'no es una URL válida');
      problemas.push(`${clave} no parece una cadena de conexión.`);
      continue;
    }
    const pooler = d.host.includes('-pooler');
    const marcador = /^(TU_|PENDIENTE|CLAVE|OWNER|<)/i.test(new URL(valor).password ?? '');

    if (marcador) {
      linea(MAL, clave, `${d.usuario}@${d.host} — contraseña sin sustituir`);
      problemas.push(`${clave} todavía tiene un marcador en lugar de la contraseña.`);
    } else if (pooler !== debePooler) {
      linea(MAL, clave, `${d.usuario}@${d.host}`);
      problemas.push(
        `${clave} usa el endpoint ${pooler ? 'AGRUPADO' : 'DIRECTO'} y necesita el ${debePooler ? 'AGRUPADO (-pooler)' : 'DIRECTO (sin -pooler)'}.` +
          (debePooler ? '' : '\n     Las migraciones no funcionan contra el agrupado.'),
      );
    } else {
      linea(OK, clave, `${d.usuario}@${d.host} ${pooler ? '(agrupado)' : '(directo)'}`);
    }
  }

  // R2: la aplicación nunca debe conectarse con el rol propietario.
  const app = activas['DATABASE_APP_URL'];
  const owner = activas['DATABASE_URL'];
  if (app && owner) {
    try {
      if (new URL(app).username === new URL(owner).username) {
        linea(MAL, 'Rol de aplicación', 'es el MISMO que el propietario');
        problemas.push(
          'DATABASE_APP_URL usa el rol propietario, que puede saltarse Row Level Security.\n' +
            '     El aislamiento entre agencias sería ficticio. Regla R2 y ADR-0007.\n' +
            '     pnpm --filter @viajapro/database run rol:crear',
        );
      }
    } catch {
      /* ya reportado arriba */
    }
  }
}

// --- git -----------------------------------------------------------------
const rama = comando('git', ['branch', '--show-current']);
if (rama === 'main') {
  linea(AVISO, 'Rama actual', 'main — el trabajo va en ramas (R11)');
  avisos.push(
    'Estás en main. Antes de trabajar:\n     git checkout -b feat/<contexto>-<descripcion>',
  );
} else if (rama) {
  linea(OK, 'Rama actual', rama);
}

// --- Resumen -------------------------------------------------------------
console.log('');
if (problemas.length === 0 && avisos.length === 0) {
  console.log(`  ${VERDE}Todo listo.${FIN}\n`);
  process.exit(0);
}

if (problemas.length > 0) {
  console.log(`  ${ROJO}Hay que resolver:${FIN}`);
  problemas.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
  console.log('');
}
if (avisos.length > 0) {
  console.log(`  ${AMARILLO}Conviene mirar:${FIN}`);
  avisos.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
  console.log('');
}

process.exit(problemas.length > 0 ? 1 : 0);
