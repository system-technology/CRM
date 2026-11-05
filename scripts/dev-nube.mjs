#!/usr/bin/env node
/**
 * Arranca el stack completo en un entorno de nube (Codespaces con .devcontainer/) o en
 * cualquier maquina con Postgres y Redis en localhost.
 *
 *   pnpm dev:nube                 genera .env, migra, siembra (solo la primera vez), arranca api y web
 *   pnpm dev:nube --resembrar     fuerza de nuevo la semilla
 *   pnpm dev:nube --solo-preparar migra y siembra, sin arrancar api ni web
 *   pnpm dev:nube --reescribir-env  solo FUERA de un Codespace y con un .env ya existente: lo
 *                                 reescribe para apuntar a localhost (si no, se niega a correr)
 *
 * Secuencia (la misma de README y de la bitacora de veracidad):
 *   db:migrate:deploy -> roles:dev -> db:seed -> identidad:sembrar-dev -> api + web
 *
 * R6: no hay secretos en el repositorio. Lo sensible llega por variables de entorno (en
 * Codespaces, "secrets" del usuario) y lo que falta se GENERA al azar y vive solo en `.env`,
 * que esta fuera de git. El propietario del Postgres del contenedor usa una clave de
 * desarrollo igual a la de infra/docker (ver .devcontainer/docker-compose.yml): la base solo
 * existe dentro del contenedor.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const win = process.platform === 'win32';

function fallar(mensaje) {
  console.error(`\n${mensaje}`);
  process.exit(1);
}

// --- URLs publicas ------------------------------------------------------------------------
const nombre = process.env['CODESPACE_NAME'];
const dominio = process.env['GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN'];
const enCodespaces = Boolean(nombre && dominio);
const urlWeb = enCodespaces ? `https://${nombre}-3000.${dominio}` : 'http://localhost:3000';
const urlApi = enCodespaces ? `https://${nombre}-3333.${dominio}` : 'http://localhost:3333';

// --- .env ---------------------------------------------------------------------------------
// Este script REESCRIBE DATABASE_URL, DIRECT_URL y las cuatro URLs de los roles de aplicacion para
// apuntar a la base del contenedor (localhost). Si ya hay un .env fuera de un Codespace, casi
// seguro es el de alguien que desarrolla contra Neon: se negaria a perderlo en silencio.
if (!enCodespaces && existsSync('.env') && !args.has('--reescribir-env')) {
  fallar(
    'Ya existe un .env y no estas en un Codespace: este script lo reescribiria para apuntar a la\n' +
      'base del contenedor (localhost) y perderias tus URLs de base de datos.\n' +
      'Hazlo a proposito con --reescribir-env (guarda antes una copia de tu .env).',
  );
}
if (!existsSync('.env')) {
  if (!existsSync('.env.example')) fallar('No encuentro .env.example: ejecuta desde la raiz.');
  writeFileSync('.env', readFileSync('.env.example', 'utf8'));
  console.log('.env creado desde .env.example');
}
let env = readFileSync('.env', 'utf8');

function leer(clave) {
  const m = env.match(new RegExp(`^${clave}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}
function fijar(clave, valor) {
  const linea = `${clave}=${valor}`;
  const re = new RegExp(`^${clave}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, () => linea) : `${env.replace(/\n*$/, '\n')}${linea}\n`;
}
/** Conserva lo que ya hay en .env; si esta vacio, lo genera. */
function generar(clave, fabrica) {
  if (!leer(clave)) fijar(clave, fabrica());
}
const b64 = (n) => randomBytes(n).toString('base64');
const hex = (n) => randomBytes(n).toString('hex');

// Claves aleatorias propias de este entorno (nunca viajan al repositorio).
generar('BETTER_AUTH_SECRET', () => b64(48));
generar('ENCRYPTION_MASTER_KEY', () => b64(32));
generar('WHATSAPP_DIRECTORY_PEPPER', () => b64(32));
generar('WEBHOOK_PAYLOAD_KEY', () => b64(32));
generar('CORREO_PAYLOAD_KEY', () => b64(32));
generar('IDENTIDAD_DEV_PASSWORD', () => hex(12)); // 24 caracteres
generar('DB_DEV_PASSWORD', () => hex(12));

// Secretos que el usuario aporta (los secrets de Codespaces llegan como variables de entorno).
for (const clave of [
  'META_APP_ID',
  'META_APP_SECRET',
  'META_SYSTEM_USER_TOKEN',
  'META_PHONE_NUMBER_ID_PRUEBA',
  'META_WABA_ID_PRUEBA',
  'META_TENANT_ID_PRUEBA',
  'ANTHROPIC_API_KEY',
]) {
  if (process.env[clave]) fijar(clave, process.env[clave]);
}
// El verify token lo elige el usuario y debe coincidir con el panel de Meta. Si no lo aporta,
// se genera uno y se imprime al final.
const tokenActual = leer('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
if (process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN']) {
  fijar('WHATSAPP_WEBHOOK_VERIFY_TOKEN', process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN']);
} else if (!tokenActual || tokenActual.startsWith('cambiar-por')) {
  fijar('WHATSAPP_WEBHOOK_VERIFY_TOKEN', hex(16));
}

/** Cadena de conexion a la base local del contenedor para un rol dado. */
function cadena(rol, clave) {
  const u = new URL('postgresql://localhost:5432/viajapro?schema=public');
  u.username = rol;
  u.password = clave;
  return u.toString();
}
const claveRoles = leer('DB_DEV_PASSWORD');
const propietario = cadena('viajapro', 'viajapro'); // POSTGRES_PASSWORD del compose: solo desarrollo
fijar('DATABASE_URL', propietario);
fijar('DIRECT_URL', propietario);
fijar('DATABASE_APP_URL', cadena('viajapro_app', claveRoles));
fijar('DATABASE_ALTAS_URL', cadena('viajapro_altas', claveRoles));
fijar('DATABASE_WEBHOOK_URL', cadena('viajapro_webhook', claveRoles));
fijar('DATABASE_IDENTIDAD_URL', cadena('viajapro_identidad', claveRoles));
fijar('REDIS_URL', 'redis://localhost:6379');
fijar('MAIL_PROVIDER', 'mailpit');
fijar('MAIL_SMTP_HOST', 'localhost');
fijar('MAIL_SMTP_PORT', '1025');
fijar('COLA_CORREO', 'memoria'); // sin trabajador aparte: el correo sale al instante a Mailpit
fijar('APP_ENV', 'local');
fijar('API_PUBLIC_URL', urlApi);
fijar('WEB_PUBLIC_URL', urlWeb);
fijar('NEXT_PUBLIC_API_URL', urlApi);
if (enCodespaces) fijar('API_TRUST_PROXY', '1'); // el reenvio de puertos pone un proxy delante

writeFileSync('.env', env);

// --- Pasos --------------------------------------------------------------------------------
function paso(titulo, orden) {
  console.log(`\n== ${titulo}`);
  const r = spawnSync('pnpm', orden, { stdio: 'inherit', shell: win });
  if (r.status !== 0) fallar(`Fallo: ${titulo}. Revisa el mensaje de arriba.`);
}

const marca = 'node_modules/.cache/dev-nube-sembrado';
// migrate deploy es idempotente: se puede repetir en cada arranque.
paso('Migraciones', ['db:migrate:deploy']);
// roles:dev lee DB_DEV_PASSWORD del .env (dotenv) y pone esa clave a los cuatro roles.
paso('Contrasenas de desarrollo de los roles de aplicacion', [
  '--filter',
  '@viajapro/database',
  'run',
  'roles:dev',
]);

if (args.has('--resembrar') || !existsSync(marca)) {
  paso('Semilla (agencia demo)', ['db:seed']);
  paso('Credenciales de las identidades demo', [
    '--filter',
    '@viajapro/api',
    'identidad:sembrar-dev',
  ]);
  mkdirSync('node_modules/.cache', { recursive: true });
  writeFileSync(marca, new Date().toISOString());
} else {
  console.log('\n== Semilla ya aplicada (usa --resembrar para repetirla)');
}

console.log(`
-----------------------------------------------------------------------------
 Web:      ${urlWeb}
 API:      ${urlApi}   (el webhook de Meta es ${urlApi}/webhooks/whatsapp)
 Mailpit:  puerto 8025
 Usuario:  dueno@agenciademo.test
 Clave:    ${leer('IDENTIDAD_DEV_PASSWORD')}   (solo desarrollo; vive en .env)
 Verify token del webhook: ${leer('WHATSAPP_WEBHOOK_VERIFY_TOKEN')}
-----------------------------------------------------------------------------`);

if (args.has('--solo-preparar')) process.exit(0);

// --- Arranque -----------------------------------------------------------------------------
const definiciones = [
  ['api', ['--filter', '@viajapro/api', 'dev'], {}],
  [
    'web',
    ['--filter', '@viajapro/web', 'dev'],
    {
      NEXT_PUBLIC_API_URL: urlApi,
      NEXT_PUBLIC_WS_URL: urlApi,
      NEXT_PUBLIC_USE_REAL_AUTH: 'true',
      NEXT_PUBLIC_USE_REAL_CRM: 'true',
      NEXT_PUBLIC_USE_REAL_INBOX: 'true',
    },
  ],
];

function detener(codigo) {
  for (const h of hijos) if (!h.killed) h.kill('SIGTERM');
  process.exit(codigo);
}

const hijos = definiciones.map(([etiqueta, orden, extra]) => {
  const p = spawn('pnpm', orden, {
    stdio: 'inherit',
    shell: win,
    env: { ...process.env, ...extra },
  });
  p.on('exit', (codigo) => {
    console.error(`\n[${etiqueta}] termino con codigo ${codigo}. Deteniendo el resto.`);
    detener(codigo ?? 1);
  });
  return p;
});
process.on('SIGINT', () => detener(0));
process.on('SIGTERM', () => detener(0));
