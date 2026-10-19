/**
 * Borra tenants y todo lo que cuelgue de ellos, descubriendo el orden en vez de saberlo.
 *
 * **Por qué existe esto y no un `DELETE FROM tenants` a secas.** La prueba de aislamiento llevaba
 * exactamente eso en su `afterAll`, y falla:
 *
 *     update or delete on table "cuentas_whatsapp" violates RESTRICT setting of foreign key
 *     constraint "enrutamiento_canales_cuenta_id_tenant_resuelto_id_fkey"
 *
 * El borrado no se completa, los tres tenants de fixture **sobreviven**, y la corrida siguiente
 * revienta con `duplicate key` en diecisiete aserciones que no tienen nada que ver con el
 * aislamiento. Pasó hoy, 2026-10-13, y costó media hora de perseguir fantasmas: un rojo que
 * parece una fuga de seguridad y es higiene del suite.
 *
 * **El orden se descubre, no se codifica.** Una lista de tablas escrita a mano se queda vieja con
 * la primera migración que añada una. Se intenta cada tabla; la que falle por dependencia se
 * reintenta en la vuelta siguiente, cuando ya se habrá ido quien la retenía. Con `SAVEPOINT`,
 * para que un fallo esperado no aborte la transacción entera.
 *
 * **Y no basta con buscar `tenant_id`:** `enrutamiento_canales` usa `tenant_resuelto_id`, y el
 * historial `tenant_anterior`, `tenant_nuevo` y `actor_tenant_id`. Por eso el barrido pregunta a
 * la base por toda columna `uuid` cuyo nombre contenga `tenant`.
 */

/**
 * @param {import('pg').Client} cliente  Con el rol propietario: es el único que puede borrar.
 * @param {readonly string[]} ids        Los tenants a borrar.
 * @returns {Promise<{filas: number, tenants: number}>}
 */
export async function borrarTenants(cliente, ids) {
  if (ids.length === 0) return { filas: 0, tenants: 0 };

  // **Las versiones de cotización son inmutables y solo la purga las borra** (migración
  // 20261019200000). El disparador exige dos cosas: ser el propietario —este cliente lo es— y
  // declarar en ESTA transacción qué tenants se purgan. `true` = local a la transacción: por eso
  // los tres llamadores envuelven esto en BEGIN/COMMIT. Sin la declaración, el DELETE de
  // `versiones_cotizacion` revienta con 23001 y el bucle de abajo lo reintenta hasta rendirse,
  // que es el fallo ruidoso que se quiere si alguien llama a esto fuera de una transacción.
  await cliente.query("SELECT set_config('viajapro.purga_de_tenants', $1, true)", [ids.join(',')]);

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

  let filas = 0;
  const conFilas = [];
  for (const [tabla, cols] of porTabla) {
    const { rows } = await cliente.query(
      `SELECT count(*)::int AS n FROM public."${tabla}" WHERE ${condicion(cols)}`,
      [ids],
    );
    if (rows[0].n > 0) {
      conFilas.push({ tabla, cols });
      filas += rows[0].n;
    }
  }

  let pendientes = [...conFilas];
  for (let vuelta = 1; pendientes.length > 0 && vuelta <= 10; vuelta += 1) {
    const fallaron = [];
    for (const item of pendientes) {
      await cliente.query('SAVEPOINT intento_borrado');
      try {
        await cliente.query(`DELETE FROM public."${item.tabla}" WHERE ${condicion(item.cols)}`, [
          ids,
        ]);
        await cliente.query('RELEASE SAVEPOINT intento_borrado');
      } catch (error) {
        await cliente.query('ROLLBACK TO SAVEPOINT intento_borrado');
        // 23001 RESTRICT, 23503 violación de clave foránea: las dos significan «todavía no».
        if (error?.code !== '23001' && error?.code !== '23503') throw error;
        fallaron.push(item);
      }
    }
    if (fallaron.length === pendientes.length) {
      throw new Error(
        `Ciclo de dependencias entre: ${fallaron.map((f) => f.tabla).join(', ')}. ` +
          'Ninguna se pudo borrar en una vuelta entera.',
      );
    }
    pendientes = fallaron;
  }

  const { rowCount } = await cliente.query('DELETE FROM tenants WHERE id = ANY($1)', [ids]);
  return { filas, tenants: rowCount ?? 0 };
}
