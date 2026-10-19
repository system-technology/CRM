/**
 * Verificación POR MUTACIÓN de la prueba de aislamiento.
 *
 * Una aserción que nunca se ha visto en rojo no es una protección: es una esperanza.
 * Este script rompe el aislamiento a propósito, una rotura cada vez, y exige que la
 * aserción correspondiente FALLE. Si pasa con el sistema roto, la aserción es decorativa
 * y el hallazgo es bloqueante.
 *
 * EMPIEZA POR UN CONTROL, y sin él el informe no valdría nada: si el arnés no supiera
 * arrancar vitest —falta una variable de entorno, un binario, lo que sea—, todas las
 * mutaciones saldrían «rojas» y el resultado sería un falso positivo perfecto. Antes de
 * romper nada, cada aserción implicada tiene que estar VERDE sobre el sistema sano.
 *
 * Cada mutación se revierte SIEMPRE, también si la prueba revienta: se reaplica
 * `aplicar_aislamiento_tenant`, que es la única forma de volver al estado bueno sin
 * copiar la plantilla de la política en dos sitios.
 *
 * Uso: pnpm --filter @viajapro/database run mutaciones
 */
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const URL_ADMIN = process.env.DATABASE_URL;
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario).');
if (!process.env.DATABASE_APP_URL) throw new Error('Falta DATABASE_APP_URL (rol de aplicación).');

const raizPaquete = fileURLToPath(new URL('..', import.meta.url));
// El binario de vitest del propio paquete, invocado con el Node actual.
// NO `npx`: en Windows abre otro intérprete, no hereda bien el entorno y su fallo es
// indistinguible del fallo de la prueba — que es exactamente lo que el CONTROL atrapó.
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const TABLAS = [
  'conversaciones',
  'mensajes',
  'adjuntos',
  'plantillas_whatsapp',
  'cotizaciones',
  'versiones_cotizacion',
];

/**
 * Quita los codigos de color ANSI de la salida de vitest.
 *
 * La expresion se construye desde una cadena en vez de escribirse como literal porque un
 * caracter de control dentro de un literal de expresion regular es invisible al leerlo: no se
 * distingue de un espacio, y la regla `no-control-regex` existe justo para eso. Aqui es
 * deliberado --el ESC de los colores de terminal-- y se nombra.
 */
const ESC = String.fromCharCode(27);
// `[[]` es una clase de caracteres que contiene un corchete: no necesita escaparse, y asi
// la expresion no depende de cuantas capas de comillas la hayan atravesado.
const COLORES_ANSI = new RegExp(ESC + '[[][0-9;]*m', 'g');
const limpio = (t) => t.replace(COLORES_ANSI, '');

/** Corre las aserciones cuyo nombre contiene `nombre`. */
function correr(nombre) {
  const resumen = (texto) =>
    limpio(texto)
      .split('\n')
      .filter((l) => /Tests\s+\d|AssertionError|Error:/.test(l))
      .map((l) => l.trim())
      .join(' | ')
      .slice(0, 200);
  try {
    const salida = execFileSync(
      process.execPath,
      [VITEST, 'run', 'tests/aislamiento.spec.ts', '-t', nombre],
      { cwd: raizPaquete, stdio: 'pipe', env: process.env },
    );
    return { verde: true, salida: resumen(String(salida)) };
  } catch (e) {
    return {
      verde: false,
      salida: resumen(`${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`),
    };
  }
}

const MUTACIONES = [
  {
    nombre: 'M1 — borrar la política tenant_isolation de conversaciones',
    sql: `DROP POLICY tenant_isolation ON conversaciones`,
    prueba: '35',
  },
  {
    nombre: 'M2 — desactivar FORCE ROW LEVEL SECURITY en mensajes',
    sql: `ALTER TABLE mensajes NO FORCE ROW LEVEL SECURITY`,
    prueba: '35',
  },
  {
    nombre: 'M3 — política de plantillas SIN WITH CHECK',
    sql: `DROP POLICY tenant_isolation ON plantillas_whatsapp;
          CREATE POLICY tenant_isolation ON plantillas_whatsapp
            USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)`,
    prueba: '35',
  },
  {
    // LA MUTACIÓN QUE IMPORTA: el punto ciego que quedó señalado en la pasada anterior.
    // polwithcheck no es NULL, la política existe, RLS está forzada: catálogo en verde.
    // Y cualquier agencia puede INSERTAR filas dentro de los datos de otra.
    nombre: 'M4 — WITH CHECK (true): presente pero DIVERGENTE de USING  [el punto ciego]',
    sql: `DROP POLICY tenant_isolation ON mensajes;
          CREATE POLICY tenant_isolation ON mensajes
            USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
            WITH CHECK (true)`,
    prueba: '36',
  },
  {
    nombre: 'M5 — política FOR SELECT en vez de FOR ALL',
    sql: `DROP POLICY tenant_isolation ON adjuntos;
          CREATE POLICY tenant_isolation ON adjuntos FOR SELECT
            USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)`,
    prueba: '36',
  },
  {
    nombre: 'M6 — clave foránea SIMPLE en vez de compuesta con el tenant',
    sql: `ALTER TABLE conversaciones DROP CONSTRAINT conversaciones_contacto_id_tenant_id_fkey;
          ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_contacto_id_tenant_id_fkey
            FOREIGN KEY (contacto_id) REFERENCES contactos (id) ON DELETE CASCADE`,
    prueba: '39',
    restaurar: `ALTER TABLE conversaciones DROP CONSTRAINT conversaciones_contacto_id_tenant_id_fkey;
                ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_contacto_id_tenant_id_fkey
                  FOREIGN KEY (contacto_id, tenant_id) REFERENCES contactos (id, tenant_id)
                  ON DELETE CASCADE ON UPDATE RESTRICT`,
  },
  {
    nombre: 'M7 — quitar la unicidad de (tenant_id, wamid)',
    sql: `DROP INDEX mensajes_tenant_id_wamid_key`,
    prueba: '40',
    restaurar: `CREATE UNIQUE INDEX mensajes_tenant_id_wamid_key
                  ON mensajes (tenant_id, wamid) WHERE wamid IS NOT NULL`,
  },
  // --- Cotizaciones (20261019200000) ---
  {
    nombre: 'M8 — cotizaciones SIN RLS: lectura cruzada',
    sql: `ALTER TABLE cotizaciones DISABLE ROW LEVEL SECURITY`,
    prueba: '48',
  },
  {
    nombre: 'M9 — versiones_cotizacion con WITH CHECK (true): escritura cruzada',
    sql: `DROP POLICY tenant_isolation ON versiones_cotizacion;
          CREATE POLICY tenant_isolation ON versiones_cotizacion
            USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
            WITH CHECK (true)`,
    prueba: '48',
  },
  {
    nombre: 'M10 — versión colgando de la cotización de otra agencia (foránea SIMPLE)',
    sql: `ALTER TABLE versiones_cotizacion DROP CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey;
          ALTER TABLE versiones_cotizacion ADD CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey
            FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones (id) ON DELETE RESTRICT`,
    prueba: '48',
    restaurar: `ALTER TABLE versiones_cotizacion DROP CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey;
                ALTER TABLE versiones_cotizacion ADD CONSTRAINT versiones_cotizacion_cotizacion_id_tenant_id_fkey
                  FOREIGN KEY (cotizacion_id, tenant_id) REFERENCES cotizaciones (id, tenant_id)
                  ON DELETE RESTRICT ON UPDATE RESTRICT`,
  },
  {
    nombre: 'M11 — sin el disparador de inmutabilidad: una versión se edita',
    sql: `ALTER TABLE versiones_cotizacion DISABLE TRIGGER versiones_cotizacion_inmutables`,
    prueba: '49',
    restaurar: `ALTER TABLE versiones_cotizacion ENABLE TRIGGER versiones_cotizacion_inmutables`,
  },
  {
    nombre: 'M12 — sin el disparador de alta: líneas que no suman el total',
    sql: `ALTER TABLE versiones_cotizacion DISABLE TRIGGER versiones_cotizacion_validar_alta`,
    prueba: '50',
    restaurar: `ALTER TABLE versiones_cotizacion ENABLE TRIGGER versiones_cotizacion_validar_alta`,
  },
  {
    nombre: 'M13 — mensajes.cotizacion_id con foránea SIMPLE',
    sql: `ALTER TABLE mensajes DROP CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey;
          ALTER TABLE mensajes ADD CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey
            FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones (id) ON DELETE SET NULL`,
    prueba: '51',
    restaurar: `ALTER TABLE mensajes DROP CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey;
                ALTER TABLE mensajes ADD CONSTRAINT mensajes_cotizacion_id_tenant_id_fkey
                  FOREIGN KEY (cotizacion_id, tenant_id) REFERENCES cotizaciones (id, tenant_id)
                  ON DELETE SET NULL (cotizacion_id) ON UPDATE RESTRICT`,
  },
];

console.log('--- CONTROL: el sistema sano, sin ninguna mutacion ---');
let controlOk = true;
for (const prueba of [...new Set(MUTACIONES.map((m) => m.prueba))]) {
  const r = correr(prueba);
  controlOk &&= r.verde;
  console.log(`${r.verde ? 'VERDE' : 'ROJO '}  control ${prueba}  ->  ${r.salida}`);
}
if (!controlOk) {
  console.error('\nEl control NO esta verde: el arnes o la base estan mal. No se muta nada.');
  process.exit(1);
}

const admin = new Client({ connectionString: URL_ADMIN });
await admin.connect();

console.log('\n--- MUTACIONES ---');
const resultados = [];
for (const m of MUTACIONES) {
  // Sin valor inicial: si `correr` lanzara, la mutacion quedaria contada como VERDE, que es
  // justo el falso positivo que este arnes existe para no tener. Que reviente es preferible.
  let r;
  try {
    await admin.query(m.sql);
    r = correr(m.prueba);
  } finally {
    if (m.restaurar) await admin.query(m.restaurar);
    for (const t of TABLAS) await admin.query('SELECT aplicar_aislamiento_tenant($1)', [t]);
  }
  resultados.push({ nombre: m.nombre, rojo: !r.verde, salida: r.salida });
  console.log(`${r.verde ? 'VERDE' : 'ROJO '}  ${m.nombre}\n        ->  ${r.salida}`);
}

const { rows } = await admin.query(
  'SELECT tabla, problema FROM tablas_sin_aislamiento WHERE problema IS NOT NULL',
);
await admin.end();

console.log('\n================ RESUMEN ================');
for (const r of resultados) {
  console.log(`${r.rojo ? '[OK]    se puso ROJA  ' : '[FALLO] paso VERDE    '} ${r.nombre}`);
}
console.log(
  `\nEstado final de tablas_sin_aislamiento: ${rows.length === 0 ? 'vacia (sana)' : JSON.stringify(rows)}`,
);

if (resultados.some((r) => !r.rojo) || rows.length > 0) {
  console.error('\nHALLAZGO BLOQUEANTE: hay aserciones que no detectan su propia rotura.');
  process.exit(1);
}
console.log(`\nLas ${resultados.length} mutaciones se detectaron. Ninguna asercion es decorativa.`);
