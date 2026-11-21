#!/usr/bin/env node
/**
 * Genera TODAS las capturas del manual de usuario de una pasada (T-562).
 *
 * Todas son de modo demostración: la web con datos de muestra, sin API ni Postgres.
 * Se toman contra la web COMPILADA (`next build` + `next start`), nunca contra `next dev`
 * (la insignia de errores de Next y el HMR no son lo que verá la agencia).
 *
 * Uso (desde la raíz del repositorio, con la web ya sirviendo en :3000):
 *
 *   node docs/06-manual/capturas.mjs                       # todas menos el ingreso
 *   node docs/06-manual/capturas.mjs --solo=dueno-05-reportes,asesor-02-hoy
 *   node docs/06-manual/capturas.mjs --ingreso             # solo la pantalla de ingreso
 *   node docs/06-manual/capturas.mjs --base=http://localhost:3001
 *
 * `--ingreso` exige una web compilada con NEXT_PUBLIC_USE_REAL_AUTH=true; con esa compilación el modo
 * demostración ya no entra, así que las demás se toman con una compilación SIN esa variable.
 * Detalle y requisitos: docs/06-manual/regenerar-capturas.md.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Playwright viene preinstalado en el entorno de las sesiones y se resuelve por NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const argumentos = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [clave, ...resto] = a.slice(2).split('=');
      return [clave, resto.length ? resto.join('=') : 'true'];
    }),
);
const BASE = argumentos.base ?? 'http://localhost:3000';
const SOLO = argumentos.solo ? argumentos.solo.split(',') : null;
const DESTINO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'imagenes') + path.sep;
const VENTANA = { width: 1280, height: 800 };

/** Pausa tras navegar: las pantallas piden sus datos de muestra al montarse. */
const ESPERA = 2500;

async function ir(p, ruta) {
  await p.goto(BASE + ruta, { timeout: 120_000 });
  await p.waitForTimeout(ESPERA);
}

async function abrirSeccionDeConfiguracion(p, nombre) {
  await ir(p, '/configuracion');
  await p.getByText(nombre).first().click();
  await p.waitForTimeout(1200);
}

async function abrirArchivo1043(p) {
  await ir(p, '/viajes');
  await p.getByText('File 1043').first().click();
  await p.waitForTimeout(1500);
}

/**
 * La lista de capturas, en el orden del manual. Cada una prepara la pantalla; el guion toma la foto.
 *
 * Capturas MANUALES o frágiles — se anotan aquí en vez de pelearse con ellas:
 *  - asesor-04-conversacion-abierta: depende de cómo la bandeja abre un chat en demostración
 *    (ver el comentario de esa entrada).
 */
const CAPTURAS = {
  'asesor-02-hoy': (p) => ir(p, '/'),
  'asesor-03-conversaciones': (p) => ir(p, '/bandeja'),
  'asesor-04-conversacion-abierta': async (p) => {
    await ir(p, '/bandeja');
    await p.getByText('Juan Pérez').first().click();
    await p.waitForTimeout(2000);
  },
  'asesor-05-oportunidades': (p) => ir(p, '/pipeline'),
  'asesor-06-cotizador': (p) => ir(p, '/cotizador'),
  'asesor-07-cotizaciones': (p) => ir(p, '/cotizaciones'),
  'asesor-08-archivos-de-viaje': (p) => ir(p, '/viajes'),
  'asesor-09-archivo-de-viaje': abrirArchivo1043,
  'asesor-10-registrar-pago': async (p) => {
    await abrirArchivo1043(p);
    await p
      .getByRole('button', { name: /Registrar pago/ })
      .first()
      .click();
    await p.waitForTimeout(800);
  },
  // El usuario de la demostración tiene permisos de dueño: se elige «Míos» para acercarse a lo que ve un
  // asesor. La vista de un asesor puro («Mis números», sin comparación entre asesores) no se puede
  // capturar en demostración.
  'asesor-11-mis-numeros': async (p) => {
    await ir(p, '/reportes');
    await p.getByRole('combobox').first().selectOption({ label: 'Míos' });
    await p.waitForTimeout(1500);
  },
  'dueno-01-configuracion': (p) => ir(p, '/configuracion'),
  'dueno-02-etapas': (p) => abrirSeccionDeConfiguracion(p, 'Etapas del Pipeline'),
  'dueno-03-catalogo': (p) => ir(p, '/catalogo'),
  'dueno-04-datos-de-la-agencia': (p) => abrirSeccionDeConfiguracion(p, 'Marca y Datos Fiscales'),
  'dueno-05-reportes': (p) => ir(p, '/reportes'),
};

async function capturarIngreso(navegador) {
  // Contexto limpio y SIN modo demostración: es lo que ve quien llega por primera vez, con el aviso de
  // cookies a la vista (el paso 1 del recorrido del asesor lo documenta).
  const contexto = await navegador.newContext({ viewport: VENTANA, deviceScaleFactor: 2 });
  const p = await contexto.newPage();
  await ir(p, '/ingresar');
  // Página completa: el conmutador de tema vive en el pie y la ventana de 800 px lo deja fuera.
  await p.screenshot({ path: DESTINO + 'asesor-01-ingreso.png', fullPage: true });
  console.log(`ok   asesor-01-ingreso (${p.url()})`);
  await contexto.close();
}

async function main() {
  const navegador = await chromium.launch();
  let fallos = 0;
  try {
    if (argumentos.ingreso) {
      await capturarIngreso(navegador);
      return;
    }

    const contexto = await navegador.newContext({ viewport: VENTANA, deviceScaleFactor: 2 });
    await contexto.addInitScript(() => localStorage.setItem('viajapro_modo_demo', 'true'));
    const p = await contexto.newPage();

    // El aviso de cookies se acepta una sola vez, al principio; las demás capturas salen sin él.
    await ir(p, '/');
    const soloNecesarias = p.getByRole('button', { name: 'Solo necesarias' });
    if (await soloNecesarias.count()) await soloNecesarias.first().click();

    for (const [nombre, preparar] of Object.entries(CAPTURAS)) {
      if (SOLO && !SOLO.includes(nombre)) continue;
      try {
        await preparar(p);
        await p.screenshot({ path: DESTINO + nombre + '.png' });
        console.log(`ok   ${nombre}`);
      } catch (error) {
        fallos += 1;
        console.log(`FALLO ${nombre}: ${String(error.message).split('\n')[0]}`);
      }
    }
    await contexto.close();
  } finally {
    await navegador.close();
  }
  if (fallos > 0) process.exitCode = 1;
}

await main();
