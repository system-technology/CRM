/**
 * La migración `20261104160000_historial_de_estados_de_cotizacion` (T-132).
 *
 * El aislamiento, las foráneas, el «solo añadir» y las transiciones los vigila
 * `aislamiento.spec.ts` (78 a 81). Aquí se fija el CONTRATO que usan el caso de uso de `quoting` y
 * los reportes:
 *   · la forma de la tabla (tipos, nulabilidad, sin texto libre);
 *   · que el rol de la API (`viajapro_app`) escribe el alta y las transiciones bajo RLS y lee la
 *     línea de vida en orden, y que otra agencia no la ve;
 *   · que «aceptadas en el periodo» —la consulta de ventas del mes— usa su índice.
 *
 * Todo dentro de una transacción que se deshace: no queda nada en la base compartida. Las
 * operaciones de la aplicación corren con `SET LOCAL ROLE`: el propietario no prueba nada, porque
 * puede saltarse RLS.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: siembra y catálogo).');

const ROL_DE_LA_API = 'viajapro_app';

const LINEA_DE_VIDA = `
  SELECT estado_desde::text AS desde, estado_hasta::text AS hasta, usuario_id
    FROM cotizacion_cambios_estado
   WHERE tenant_id = $1 AND cotizacion_id = $2
   ORDER BY ocurrido_en, id`;

/** Ventas del periodo: las aceptaciones con su instante. */
const ACEPTADAS_DEL_PERIODO = `
  SELECT cotizacion_id, ocurrido_en
    FROM cotizacion_cambios_estado
   WHERE tenant_id = $1 AND estado_hasta = 'ACEPTADA'
     AND ocurrido_en >= $2 AND ocurrido_en < $3`;

const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10);

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
});

async function fijarTenant(tenant: string | null): Promise<void> {
  await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant ?? '']);
}

/** Una agencia con un usuario, un contacto y una cotización en BORRADOR. Dentro de la transacción. */
async function sembrar(): Promise<{ tenant: string; usuario: string; cotizacion: string }> {
  const tenant = randomUUID();
  const usuario = randomUUID();
  const identidad = randomUUID();
  const rol = randomUUID();
  const contacto = randomUUID();
  const cotizacion = randomUUID();
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, now(), now())`,
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture cotizaciones ${MARCA}`],
  );
  await admin.query(
    `INSERT INTO identidades (id, correo, nombre, actualizado_en) VALUES ($1, $2, 'Fixture', now())`,
    [identidad, `fixture-aislamiento-${MARCA}-${identidad.slice(0, 8)}@prueba.invalid`],
  );
  await fijarTenant(tenant);
  await admin.query(
    `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
     VALUES ($1, $2, 'Asesor', ARRAY['cotizacion.escribir']::text[], now())`,
    [rol, tenant],
  );
  await admin.query(
    `INSERT INTO usuarios (id, tenant_id, identidad_id, rol_id, correo, nombre, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, 'Asesora', now())`,
    [usuario, tenant, identidad, rol, `u-${identidad.slice(0, 8)}@prueba.invalid`],
  );
  await admin.query(
    `INSERT INTO contactos (id, tenant_id, telefono_e164, creado_en, actualizado_en)
     VALUES ($1, $2, '+573001116666', now(), now())`,
    [contacto, tenant],
  );
  await admin.query(
    `INSERT INTO cotizaciones (id, tenant_id, contacto_id, titulo, actualizado_en)
     VALUES ($1, $2, $3, 'Fixture', now())`,
    [cotizacion, tenant, contacto],
  );
  return { tenant, usuario, cotizacion };
}

async function comoApi<T>(tenant: string, fn: () => Promise<T>): Promise<T> {
  await admin.query('SAVEPOINT como_api');
  try {
    await admin.query(`SET LOCAL ROLE ${ROL_DE_LA_API}`);
    await fijarTenant(tenant);
    const r = await fn();
    await admin.query('RESET ROLE');
    await admin.query('RELEASE SAVEPOINT como_api');
    return r;
  } catch (error) {
    await admin.query('ROLLBACK TO SAVEPOINT como_api');
    await admin.query('RESET ROLE');
    throw error;
  }
}

const anadir = (
  a: { tenant: string; usuario: string; cotizacion: string },
  desde: string | null,
  hasta: string,
  haceMinutos: number,
) =>
  admin.query(
    `INSERT INTO cotizacion_cambios_estado
       (id, tenant_id, cotizacion_id, estado_desde, estado_hasta, usuario_id, ocurrido_en)
     VALUES ($1, $2, $3, $4::estado_cotizacion, $5::estado_cotizacion, $6,
             now() - make_interval(mins => $7))`,
    [randomUUID(), a.tenant, a.cotizacion, desde, hasta, a.usuario, haceMinutos],
  );

describe('migración 20261104160000 — historial de estados de la cotización', () => {
  it('la tabla tiene la forma del contrato y ninguna columna de texto libre', async () => {
    const { rows } = await admin.query(
      `SELECT column_name, CASE WHEN data_type = 'USER-DEFINED' THEN udt_name ELSE data_type END
                AS data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cotizacion_cambios_estado'
        ORDER BY ordinal_position`,
    );
    expect(rows).toEqual([
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'tenant_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'cotizacion_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'estado_desde', data_type: 'estado_cotizacion', is_nullable: 'YES' },
      { column_name: 'estado_hasta', data_type: 'estado_cotizacion', is_nullable: 'NO' },
      { column_name: 'usuario_id', data_type: 'uuid', is_nullable: 'YES' },
      { column_name: 'ocurrido_en', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ]);
  });

  it('la API escribe el alta y las transiciones bajo RLS y lee la línea de vida en orden; otra agencia no la ve', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      const b = await sembrar();

      const filas = await comoApi(a.tenant, async () => {
        await anadir(a, null, 'BORRADOR', 30);
        await anadir(a, 'BORRADOR', 'ENVIADA', 20);
        await anadir(a, 'ENVIADA', 'ACEPTADA', 10);
        const { rows } = await admin.query<Record<string, unknown>>(LINEA_DE_VIDA, [
          a.tenant,
          a.cotizacion,
        ]);
        return rows;
      });
      expect(filas).toEqual([
        { desde: null, hasta: 'BORRADOR', usuario_id: a.usuario },
        { desde: 'BORRADOR', hasta: 'ENVIADA', usuario_id: a.usuario },
        { desde: 'ENVIADA', hasta: 'ACEPTADA', usuario_id: a.usuario },
      ]);

      const cruzado = await comoApi(b.tenant, async () => {
        const { rows } = await admin.query(LINEA_DE_VIDA, [a.tenant, a.cotizacion]);
        return rows.length;
      });
      expect(cruzado).toBe(0);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('«aceptadas del periodo» usa el índice (tenant_id, estado_hasta, ocurrido_en)', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      await admin.query('SET LOCAL enable_seqscan = off');
      const plan = await comoApi(a.tenant, async () => {
        // Literales: EXPLAIN con parámetros enlazados depende del protocolo.
        const { rows } = await admin.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN ${ACEPTADAS_DEL_PERIODO.replace('$1', `'${a.tenant}'::uuid`)
            .replace('$2', `'2026-11-01T05:00:00Z'::timestamptz`)
            .replace('$3', `'2026-12-01T05:00:00Z'::timestamptz`)}`,
        );
        return rows.map((r) => r['QUERY PLAN']).join('\n');
      });
      expect(plan).toMatch(/idx_cotizacion_cambios_estado_por_estado/);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);
});
