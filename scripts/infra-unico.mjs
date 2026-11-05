#!/usr/bin/env node
/**
 * Levanta y baja el compose del modo `unico` (ADR-0019 paso 7): infra/docker/docker-compose.unico.yml.
 *
 *   pnpm infra:unico:up       genera .env.unico si falta, construye y levanta (api, web, postgres, mailpit)
 *   pnpm infra:unico:down     detiene y quita los contenedores; la base se conserva
 *   pnpm infra:unico:reset    ademas BORRA la base (volumen) y vuelve a levantar
 *   pnpm infra:unico:logs     sigue el registro de la API
 *
 * R6: no hay secretos en el repositorio. `.env.unico` se genera aqui con valores al azar, queda
 * fuera de git (.gitignore: `.env.*`) y se crea con permisos 0600. Si ya existe, no se toca:
 * rotarlo seria cambiar la contrasena de los roles en una base que ya los tiene (roles:dev la
 * volveria a fijar en el siguiente `up`, asi que borrar el archivo y repetir tambien funciona).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = join(raiz, 'infra', 'docker', 'docker-compose.unico.yml');
const archivoEnv = join(raiz, '.env.unico');

const hex = (bytes) => randomBytes(bytes).toString('hex');
const b64 = (bytes) => randomBytes(bytes).toString('base64');

/** Genera las variables que el compose exige con `${VAR:?}`. Ninguna sale de un valor fijo. */
function generarEnv() {
  const valores = {
    // 12+ caracteres de [A-Za-z0-9_-]: va dentro de DDL y de una URL (roles-de-desarrollo.mjs).
    DB_DEV_PASSWORD: `dev${hex(12)}`,
    IDENTIDAD_DEV_PASSWORD: `dev${hex(12)}`,
    BETTER_AUTH_SECRET: b64(48),
    ENCRYPTION_MASTER_KEY: b64(32),
    CORREO_PAYLOAD_KEY: b64(32),
    WEBHOOK_PAYLOAD_KEY: b64(32),
    WHATSAPP_DIRECTORY_PEPPER: b64(32),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: hex(16),
    META_APP_SECRET: hex(16),
  };
  const cuerpo =
    '# Generado por scripts/infra-unico.mjs. Valores de DESARROLLO al azar. NO commitear (R6).\n' +
    Object.entries(valores)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') +
    '\n';
  writeFileSync(archivoEnv, cuerpo, { mode: 0o600 });
  console.log('.env.unico creado (secretos de desarrollo al azar, fuera de git).');
}

function docker(args) {
  const r = spawnSync('docker', ['compose', '-f', compose, '--env-file', archivoEnv, ...args], {
    stdio: 'inherit',
    cwd: raiz,
  });
  if (r.error) {
    console.error(`No pude ejecutar docker: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function leer(clave) {
  const linea = readFileSync(archivoEnv, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${clave}=`));
  return linea ? linea.slice(clave.length + 1) : '';
}

function resumen() {
  console.log('\nListo. Cuando `api` aparezca como healthy:');
  console.log('  web        http://localhost:3000');
  console.log('  api        http://localhost:3333/salud/listo');
  console.log('  correo     http://localhost:8025   (Mailpit: OTP e invitaciones)');
  console.log('  usuario    dueno@agenciademo.test');
  console.log(`  clave      ${leer('IDENTIDAD_DEV_PASSWORD')}   (de desarrollo, en .env.unico)`);
  console.log('Runbook: docs/07-ingenieria/runbook-modo-unico.md');
}

const orden = process.argv[2];
if (!['up', 'down', 'reset', 'logs'].includes(orden ?? '')) {
  console.error('Uso: node scripts/infra-unico.mjs up | down | reset | logs');
  process.exit(1);
}

if (!existsSync(archivoEnv)) {
  if (orden === 'down' || orden === 'logs') {
    console.error('No hay .env.unico: nada que detener ni leer.');
    process.exit(1);
  }
  generarEnv();
}

if (orden === 'up' || orden === 'reset') {
  if (orden === 'reset') docker(['down', '-v']);
  // `--wait` espera a que api y web esten healthy y falla si `preparar` termina con error.
  docker(['up', '-d', '--build', '--wait']);
  resumen();
} else if (orden === 'down') {
  docker(['down']);
} else {
  docker(['logs', '-f', 'api']);
}
