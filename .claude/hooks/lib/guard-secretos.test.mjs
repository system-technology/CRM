#!/usr/bin/env node
/**
 * Pruebas del guardián de secretos.
 *
 *   node .claude/hooks/lib/guard-secretos.test.mjs
 *
 * Existe porque el guardián llegó a bloquear su propia corrección: un comentario que describía
 * una cadena de conexión con interpolación coincidía con su propio patrón.
 *
 * NOTA SOBRE LOS SEÑUELOS: ninguno se escribe como literal. Todos se componen en tiempo de
 * ejecución a partir de trozos. Si estuvieran escritos enteros, el propio guardián bloquearía
 * este archivo — que es exactamente lo que pasó al escribirlo la primera vez.
 *
 * Lo que protegen, por orden de importancia:
 *   1. Que NINGÚN secreto real pase. Un falso negativo es un incidente.
 *   2. Que el código legítimo no quede bloqueado. Un guardián que estorba acaba desactivado.
 */

import { execFileSync } from 'node:child_process';

const HOOK = '.claude/hooks/guard-secretos.mjs';

/** Ejecuta el hook y devuelve true si bloqueó (código de salida 2). */
function bloquea(contenido, ruta = 'apps/api/src/ejemplo.ts') {
  const payload = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: ruta, content: contenido },
  });
  try {
    execFileSync('node', [HOOK], { input: payload, stdio: ['pipe', 'pipe', 'pipe'] });
    return false;
  } catch (e) {
    return e.status === 2;
  }
}

// --- Señuelos, todos compuestos en ejecución -----------------------------
const dsn = 'postgres' + 'ql://';
const host = '@ep-xxxx.us-east-2.aws.neon.tech/db';
const meta = 'EA' + 'A' + 'Gm0PX4ZCpsB' + 'A'.repeat(28);
const anthropic = 'sk' + '-ant-' + 'api03-' + 'a'.repeat(40);
const aws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const pem = '-----BEG' + 'IN RSA PRIVATE KEY-----';
const github = 'gh' + 'p_' + 'b'.repeat(36);

const casos = [
  // --- DEBE bloquear: parecen credenciales reales ------------------------
  [dsn + 'neondb_owner:npg7Kd9sLmQ2xVb4RtY8wZc' + host, true, 'contraseña real en cadena de conexión'],
  [`const t = "${meta}";`, true, 'token de Meta'],
  [`const k = "${anthropic}";`, true, 'clave de Anthropic'],
  [`const k = "${aws}";`, true, 'clave de acceso de AWS'],
  [pem, true, 'clave privada'],
  [`const t = "${github}";`, true, 'token de GitHub'],

  // --- NO debe bloquear: plantillas y código legítimo --------------------
  ['const url = `' + dsn + 'usuario:' + '${clave}' + host + '`;', false, 'interpolación de plantilla'],
  [dsn + 'neondb_owner:TU_CLAVE_ROTADA' + host, false, 'marcador en mayúsculas'],
  [dsn + 'viajapro_app:PENDIENTE' + host, false, 'marcador PENDIENTE'],
  [dsn + 'usuario:{{password}}' + host, false, 'plantilla de bigotes'],
  [dsn + 'usuario:<contrasena>' + host, false, 'marcador entre ángulos'],
  ['const dsn = process.env.DATABASE_URL;', false, 'lectura de variable de entorno'],
  ['// No pongas la contraseña aquí: usa DATABASE_URL', false, 'comentario'],
  ['const q = "SELECT * FROM contactos WHERE tenant_id = $1";', false, 'consulta SQL normal'],
];

let fallos = 0;
let total = 0;

for (const [contenido, esperado, descripcion] of casos) {
  total++;
  const real = bloquea(contenido);
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(
    `${ok ? 'OK   ' : 'FALLA'} ${(real ? 'bloquea' : 'permite').padEnd(8)} ${descripcion}` +
      (ok ? '' : `   <-- se esperaba ${esperado ? 'bloquear' : 'permitir'}`),
  );
}

// --- Rutas prohibidas ----------------------------------------------------
for (const [ruta, esperado] of [
  ['.env', true],
  ['secrets/clave.json', true],
  ['servidor.pem', true],
  ['.env.example', false],
  ['packages/database/prisma/schema.prisma', false],
]) {
  total++;
  const real = bloquea('contenido cualquiera', ruta);
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${(real ? 'bloquea' : 'permite').padEnd(8)} ruta ${ruta}`);
}

console.log(`\n${total - fallos}/${total} casos correctos.`);
process.exit(fallos === 0 ? 0 : 1);
