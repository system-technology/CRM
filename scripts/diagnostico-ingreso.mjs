#!/usr/bin/env node
/**
 * Diagnóstico del ingreso contra un entorno desplegado (T-599).
 *
 * POR QUÉ EXISTE. Un intento de ingreso es un POST, y la única herramienta de red de una sesión
 * hace GET. Sin esto, diagnosticar «el cliente no puede entrar» exige que una persona mire el
 * navegador y transcriba lo que ve. Con esto, la sesión lo mide sola.
 *
 * POR QUÉ NO ES `curl`. `Bash(curl:*)` está en la lista `deny` de `.claude/settings.json`, y con
 * razón: permite mandar cualquier cosa a cualquier sitio. Este script **solo habla con los hosts
 * de ViajaPro declarados abajo** y solo hace las dos peticiones de diagnóstico. Permitir este
 * script no es permitir curl.
 *
 * NO ACEPTA NI IMPRIME SECRETOS: la contraseña es un valor de descarte fijo, porque lo que se mide
 * es QUÉ RESPUESTA DA, no si la credencial vale. Las tres respuestas posibles se distinguen sin
 * conocer ninguna clave real.
 *
 *   node scripts/diagnostico-ingreso.mjs [--base <url>] [--origen <url>] [--correo <correo>]
 */

const HOSTS_PERMITIDOS = new Set([
  'viajapro-api-staging.onrender.com',
  'viajapro-staging.vercel.app',
  'localhost',
  '127.0.0.1',
]);

const BASE_POR_OMISION = 'https://viajapro-api-staging.onrender.com';
const ORIGEN_POR_OMISION = 'https://viajapro-staging.vercel.app';
/** Un correo que no debería existir: así el resultado no depende de datos reales. */
const CORREO_POR_OMISION = 'diagnostico-no-existe@viajapro.invalid';
const CLAVE_DE_DESCARTE = 'clave-de-descarte-para-diagnostico';

function argumento(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porOmision;
}

function exigirHostPermitido(url, etiqueta) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`✗ ${etiqueta} no es una URL válida: ${url}`);
    process.exit(2);
  }
  if (!HOSTS_PERMITIDOS.has(host)) {
    console.error(
      `✗ ${etiqueta} apunta a ${host}, que no es un host de ViajaPro.\n` +
        `  Permitidos: ${[...HOSTS_PERMITIDOS].join(', ')}`,
    );
    process.exit(2);
  }
}

const base = argumento('base', BASE_POR_OMISION).replace(/\/$/, '');
const origen = argumento('origen', ORIGEN_POR_OMISION).replace(/\/$/, '');
const correo = argumento('correo', CORREO_POR_OMISION);

exigirHostPermitido(base, '--base');
exigirHostPermitido(origen, '--origen');

const INTERESANTES = ['content-type', 'www-authenticate', 'x-vercel-error', 'x-render-routing'];

async function pedir(etiqueta, url, opciones) {
  process.stdout.write(`\n── ${etiqueta}\n   ${opciones.method ?? 'GET'} ${url}\n`);
  try {
    const r = await fetch(url, { ...opciones, redirect: 'manual' });
    const cuerpo = await r.text();
    console.log(`   HTTP ${r.status} ${r.statusText}`);
    for (const h of INTERESANTES) {
      const v = r.headers.get(h);
      if (v) console.log(`   ${h}: ${v}`);
    }
    console.log(`   cuerpo: ${cuerpo.slice(0, 600) || '(vacío)'}`);
    return { status: r.status, cuerpo };
  } catch (error) {
    console.log(`   ✗ falló la petición: ${error.message}`);
    return null;
  }
}

console.log(`Diagnóstico de ingreso\n  API:    ${base}\n  Origin: ${origen}\n  correo: ${correo}`);

const salud = await pedir('1. ¿La API está viva?', `${base}/salud/listo`, {});

const ingreso = await pedir('2. Intento de ingreso (POST con Origin real)', `${base}/api/v1/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: origen },
  body: JSON.stringify({ correo, clave: CLAVE_DE_DESCARTE }),
});

console.log('\n── Veredicto');
if (!salud) {
  console.log('   La API no responde: el problema no es el ingreso.');
} else if (!ingreso) {
  console.log('   La API vive pero el intento de ingreso no llegó.');
} else if (ingreso.status === 403 && ingreso.cuerpo.includes('ORIGEN_NO_CONFIABLE')) {
  console.log('   ➜ ORIGEN NO CONFIABLE. El Origin enviado no está en la lista de confianza.');
  console.log('     Arreglo: WEB_PUBLIC_URL en el panel, con esquema y sin barra final.');
} else if (ingreso.status === 401 || ingreso.status === 400) {
  console.log('   ➜ La comprobación de origen PASA y la API valida credenciales.');
  console.log('     Con un correo inexistente esto es lo esperado: el origen NO es el problema.');
  console.log('     Si un correo real da lo mismo, el usuario no existe o no tiene contraseña:');
  console.log('     hay que sembrar (el despliegue migra pero no siembra).');
} else {
  console.log(`   ➜ Respuesta no prevista (${ingreso.status}). Hay que mirarla a mano.`);
}
