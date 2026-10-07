#!/usr/bin/env node
/**
 * Hook PreToolUse (Write | Edit) — impide que un secreto entre al repositorio.
 *
 * Por qué existe: la regla R6 de CLAUDE.md dice "ningún secreto en el repositorio". Una regla
 * escrita se olvida; un hook no. Este guarda el caso más caro del proyecto: custodiamos tokens de
 * WhatsApp de nuestros clientes, y un token filtrado al historial de git no se borra, se rota.
 *
 * Protocolo: lee la invocación por stdin. Para bloquear, sale con código 2 y escribe el motivo
 * en stderr (eso vuelve al modelo como retroalimentación). Salir con 0 deja pasar.
 */

import { readFileSync } from 'node:fs';

/** Patrones de secreto real. Deben ser específicos: un falso positivo entrena a ignorar el hook. */
const PATRONES = [
  { nombre: 'Token de acceso de Meta/Facebook', re: /\bEAA[A-Za-z0-9]{20,}\b/ },
  { nombre: 'Clave secreta de Stripe', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/ },
  { nombre: 'Clave privada de Wompi', re: /\bprv_(prod|test)_[A-Za-z0-9]{16,}\b/ },
  { nombre: 'Token de Mercado Pago', re: /\bAPP_USR-[0-9]{6,}-[0-9]{6}-[a-f0-9]{32}-[0-9]+\b/ },
  { nombre: 'Clave de API de Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { nombre: 'Clave de acceso de AWS', re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { nombre: 'Token de GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { nombre: 'Clave privada PEM', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  {
    nombre: 'URL de base de datos con contraseña real',
    // La contraseña se captura aparte para poder descartar plantillas en `esPlantilla()`.
    re: /postgres(ql)?:\/\/[^:\s]+:([^@\s]{8,})@/,
    capturaClave: 2,
  },
];

/** Archivos que nunca deben escribirse desde una sesión de agente. */
const RUTAS_PROHIBIDAS = [
  /(^|[\\/])\.env$/,
  /(^|[\\/])\.env\.(local|development|staging|production)$/,
  /(^|[\\/])secrets[\\/]/,
  /\.(pem|key|p12|pfx)$/,
  /(^|[\\/])\.git[\\/]/,
];

function bloquear(motivo) {
  process.stderr.write(motivo);
  process.exit(2);
}

let entrada = '';
try {
  entrada = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // Sin stdin no hay nada que revisar; no bloquear por un fallo del hook.
}

let datos;
try {
  datos = JSON.parse(entrada);
} catch {
  process.exit(0);
}

const herramienta = datos.tool_name ?? '';
const args = datos.tool_input ?? {};
const ruta = args.file_path ?? '';

if (ruta && RUTAS_PROHIBIDAS.some((re) => re.test(ruta))) {
  bloquear(
    `Bloqueado: '${ruta}' es un archivo de secretos o de control de versiones.\n` +
      'Los valores reales se gestionan fuera del repositorio (gestor de secretos del entorno).\n' +
      'Si necesitas documentar una variable nueva, agrégala a .env.example con un valor de ejemplo.',
  );
}

// Contenido a inspeccionar según la herramienta.
const contenido = [args.content, args.new_string, args.old_string]
  .filter((v) => typeof v === 'string')
  .join('\n');

if (!contenido) process.exit(0);

// En .env.example y en la documentación se escriben ejemplos a propósito. Ahí solo dejamos pasar
// lo que esté marcado explícitamente como ficticio; todo lo demás se bloquea igual.
const esMaterialDeEjemplo = /\.env\.example$/.test(ruta) || /[\\/]docs[\\/]/.test(ruta);

/**
 * ¿Lo capturado es una plantilla y no una credencial?
 *
 * Existe porque este guardián llegó a bloquear código legítimo: una cadena de conexión cuyo
 * segmento de contraseña era una interpolación de plantilla, es decir, algo que se resuelve en
 * tiempo de ejecución y no un valor escrito en el archivo. Cualquier código que arme una cadena
 * de conexión a partir de variables tropezaría con lo mismo.
 *
 * Una credencial real nunca contiene una interpolación ni un marcador en mayúsculas.
 * El filtro es estrecho a propósito: dejar pasar un secreto es mucho peor que un falso positivo.
 */
function esPlantilla(clave) {
  if (!clave) return false;
  const interpolacion = /[$][{(]|[{][{]|%[sd]\b|<[^>]*>/;
  const marcador = /^[A-Z][A-Z0-9_]{3,}$/;
  const generico = /^(x{3,}|placeholder|password|secret|clave|changeme|pendiente|tu_clave)$/i;
  return interpolacion.test(clave) || marcador.test(clave) || generico.test(clave);
}

for (const { nombre, re, capturaClave } of PATRONES) {
  const coincidencia = contenido.match(re);
  if (coincidencia) {
    if (capturaClave && esPlantilla(coincidencia[capturaClave])) continue;

    if (esMaterialDeEjemplo && /ejemplo|example|ficticio|placeholder|xxxx/i.test(contenido)) {
      continue;
    }
    bloquear(
      `Bloqueado por el guardián de secretos: se detectó un ${nombre} en el contenido ` +
        `destinado a '${ruta || 'un archivo del repositorio'}'.\n` +
        `Coincidencia: ${coincidencia[0].slice(0, 12)}…\n\n` +
        'Regla R6 de CLAUDE.md: ningún secreto en el repositorio. Un secreto en el historial de ' +
        'git no se borra, se rota.\n' +
        'Usa una variable de entorno y documenta la clave (sin valor) en .env.example.',
    );
  }
}

process.exit(0);
