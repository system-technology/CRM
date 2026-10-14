#!/usr/bin/env node
/**
 * Limpia el residuo que deja la suite de aislamiento cuando muere antes de su `afterAll`.
 *
 * **Por qué existe.** `aislamiento.spec.ts` crea tres tenants de prueba y los borra al final.
 * Si la corrida se interrumpe —un `Ctrl+C`, un fallo de red con Neon, una terminal cerrada—,
 * esos tres tenants quedan en la base **compartida** y la siguiente corrida revienta con
 * `duplicate key` antes de comprobar una sola política. El síntoma es desconcertante: 17 de 30
 * aserciones en rojo, en un esquema que no ha cambiado, y ninguna de las rojas tiene que ver
 * con el aislamiento. Es higiene del suite disfrazada de fallo de seguridad.
 *
 * **Por qué cuenta antes de borrar, y por qué hay que pedirlo dos veces.** Esto corre con el
 * rol propietario contra una base compartida. Un identificador mal escrito aquí no borra una
 * fila de prueba: borra una agencia. Así que primero enseña exactamente qué se va a tocar y no
 * borra nada sin `--borrar`.
 *
 * **Y no acepta identificadores por parámetro.** Los tres UUID están escritos en el código,
 * iguales a los de `aislamiento.spec.ts`. Si se pudieran pasar por la línea de comandos, este
 * archivo sería una forma cómoda de borrar cualquier tenant.
 *
 *   node scripts/limpiar-fixtures.mjs            → solo cuenta
 *   node scripts/limpiar-fixtures.mjs --borrar   → cuenta y borra
 */

import pg from 'pg';
import { borrarTenants } from './borrar-tenants.mjs';

/** Los mismos tres de `tests/aislamiento.spec.ts`. Si cambian allí, cambian aquí. */
const FIXTURES = [
  '01932000-0000-7000-8000-00000000000a',
  '01932000-0000-7000-8000-00000000000b',
  '01932000-0000-7000-8000-00000000000c',
];

const BORRAR = process.argv.includes('--borrar');

const cadena = process.env['DATABASE_URL'];
if (!cadena) {
  console.error(
    'Falta DATABASE_URL. Es el rol propietario, el único que puede borrar estas filas.\n' +
      'Ejecuta con: pnpm exec dotenv -e ../../.env -- node scripts/limpiar-fixtures.mjs',
  );
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: cadena });
await cliente.connect();

try {
  const { rows: quien } = await cliente.query('SELECT current_user AS usuario');
  console.log(`Conectado como '${quien[0].usuario}'.\n`);

  const { rows: encontrados } = await cliente.query(
    'SELECT id, slug FROM tenants WHERE id = ANY($1) ORDER BY slug',
    [FIXTURES],
  );

  if (encontrados.length === 0) {
    console.log('No hay residuo: los tres tenants de fixture no existen. Nada que hacer.');
    process.exit(0);
  }

  console.log(`Tenants de fixture presentes (${encontrados.length}):`);
  for (const t of encontrados) console.log(`  · ${t.slug}  ${t.id}`);

  // Lo que NO se toca, enseñado a propósito: es la comprobación de que el filtro distingue.
  const { rows: ajenos } = await cliente.query(
    'SELECT count(*)::int AS n FROM tenants WHERE id <> ALL($1)',
    [FIXTURES],
  );
  console.log(`\nTenants que NO son fixture y no se tocan: ${ajenos[0].n}\n`);

  // Toda columna que apunte a un tenant, preguntada a la base y no a una lista escrita a mano.
  //
  // **No basta con buscar `tenant_id`.** La primera versión de este script lo hacía y se dejó
  // fuera `enrutamiento_canales`, cuya columna se llama `tenant_resuelto_id`, y el historial,
  // que usa `tenant_anterior`, `tenant_nuevo` y `actor_tenant_id`. El borrado reventó contra
  // una clave foránea `RESTRICT` desde una tabla que el barrido ni siquiera había mirado.
  //
  // El mismo descuido vive en `policies/001`, que selecciona por `attname = 'tenant_id'`: ahí
  // no es un agujero porque esas tablas están declaradas en `excepciones_rls` —lo comprobé—,
  // pero la aserción 17 del suite de aislamiento comprueba el NOMBRE de la columna, no lo que
  // guarda. Queda anotado para `qa`.
  const { rows: columnas } = await cliente.query(`
    SELECT c.relname AS tabla, a.attname AS columna
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type t ON t.oid = a.atttypid AND t.typname = 'uuid'
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname LIKE '%tenant%'
    ORDER BY 1, 2
  `);

  const porTabla = new Map();
  for (const { tabla, columna } of columnas) {
    if (!porTabla.has(tabla)) porTabla.set(tabla, []);
    porTabla.get(tabla).push(columna);
  }

  const condicion = (cols) => cols.map((c) => `"${c}" = ANY($1)`).join(' OR ');

  let total = 0;
  const conFilas = [];
  for (const [tabla, cols] of porTabla) {
    const { rows } = await cliente.query(
      `SELECT count(*)::int AS n FROM public."${tabla}" WHERE ${condicion(cols)}`,
      [FIXTURES],
    );
    if (rows[0].n > 0) {
      conFilas.push({ tabla, cols, n: rows[0].n });
      total += rows[0].n;
    }
  }

  console.log(`Filas de fixture, en ${porTabla.size} tablas con columna de tenant:`);
  for (const { tabla, n } of conFilas) console.log(`  ${tabla.padEnd(34)} ${n}`);
  console.log(`  ${'TOTAL'.padEnd(34)} ${total}\n`);

  if (!BORRAR) {
    console.log('Solo se contó. Para borrarlo: añade --borrar.');
    process.exit(0);
  }

  // Una transacción: o se va todo o no se va nada. Un borrado a medias deja la base en un
  // estado peor que el residuo, porque el `duplicate key` cambia de tabla cada vez.
  //
  // El orden lo descubre `borrarTenants`, compartido con el `afterAll` de la prueba de
  // aislamiento: el mismo código que limpia a mano es el que limpia solo, para que no haya una
  // versión buena y otra que se queda vieja.
  await cliente.query('BEGIN');
  const { tenants: rowCount } = await borrarTenants(cliente, FIXTURES);
  await cliente.query('COMMIT');

  console.log(`Borrado. ${total} filas y ${rowCount} tenants de fixture.`);

  const { rows: resto } = await cliente.query(
    'SELECT count(*)::int AS n FROM tenants WHERE id = ANY($1)',
    [FIXTURES],
  );
  console.log(`Comprobación posterior: quedan ${resto[0].n} tenants de fixture.`);
} finally {
  await cliente.end();
}
