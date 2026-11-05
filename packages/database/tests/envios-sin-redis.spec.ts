/**
 * La migración `20261104140000_envios_sin_redis_en_mensajes` (ADR-0019 paso 3).
 *
 * El estado del envío saliente vive en `mensajes`: reserva durable, intentos y arrendamiento, más
 * un índice parcial para reclamar con `FOR UPDATE SKIP LOCKED`. Aquí se fija el CONTRATO que usa el
 * adaptador (`ColaDeEnviosPostgres`, `ReservaDeEnvioPostgres`): que el rol del trabajador
 * (`viajapro_webhook`) puede reservar una sola vez, reclamar y registrar intentos bajo RLS, que no
 * alcanza los envíos de otra agencia, y que el reclamo usa el índice.
 *
 * Todo dentro de una transacción que se deshace: no queda nada en la base compartida. Las
 * operaciones de la aplicación corren con `SET LOCAL ROLE`, como `conRol` de `aislamiento.spec.ts`:
 * el propietario no prueba nada, porque puede saltarse RLS.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: siembra y catálogo).');

/** El pool del trabajador, que es quien envía (inbox-worker.module.ts). */
const ROL_DEL_ENVIO = 'viajapro_webhook';
const COLUMNAS = ['envio_reservado_en', 'envio_intentos', 'envio_siguiente_en'] as const;

/** El reclamo, tal y como lo documenta la migración. */
const RECLAMO = `
  SELECT id FROM mensajes
   WHERE tenant_id = $1 AND estado = 'PENDIENTE' AND wamid IS NULL
     AND envio_reservado_en IS NULL
     AND (envio_siguiente_en IS NULL OR envio_siguiente_en <= now())
   ORDER BY envio_siguiente_en NULLS FIRST, id
   LIMIT 10
   FOR UPDATE SKIP LOCKED`;

/** La reserva de ADR-0019 §1.2, literal. */
const RESERVA = `
  UPDATE mensajes SET envio_reservado_en = now(), actualizado_en = now()
   WHERE tenant_id = $1 AND id = $2 AND envio_reservado_en IS NULL AND wamid IS NULL
  RETURNING id`;

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

/** Una agencia con un hilo y un saliente pendiente. Como propietario y dentro de la transacción. */
async function sembrar(): Promise<{ tenant: string; mensaje: string; conversacion: string }> {
  const tenant = randomUUID();
  const cuenta = randomUUID();
  const canal = randomUUID();
  const contacto = randomUUID();
  const conversacion = randomUUID();
  const mensaje = randomUUID();
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, now(), now())`,
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture envios ${MARCA}`],
  );
  await fijarTenant(tenant);
  await admin.query(
    `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
     VALUES ($1, $2, $3, 'WABA de prueba', now())`,
    [cuenta, tenant, `waba-envios-${cuenta.slice(0, 8)}`],
  );
  await admin.query(
    `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
     VALUES ($1, $2, $3, $4, '+573001119999', now())`,
    [canal, tenant, cuenta, `pn-${canal.slice(0, 8)}`],
  );
  await admin.query(
    `INSERT INTO contactos (id, tenant_id, telefono_e164, creado_en, actualizado_en)
     VALUES ($1, $2, '+573001118888', now(), now())`,
    [contacto, tenant],
  );
  await admin.query(
    `INSERT INTO conversaciones (id, tenant_id, contacto_id, canal_id, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [conversacion, tenant, contacto, canal],
  );
  await admin.query(
    `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, ocurrido_en, actualizado_en)
     VALUES ($1, $2, $3, 'SALIENTE', 'TEXTO', 'Su cotizacion', now(), now())`,
    [mensaje, tenant, conversacion],
  );
  return { tenant, mensaje, conversacion };
}

async function comoRol<T>(tenant: string | null, fn: () => Promise<T>): Promise<T> {
  await admin.query('SAVEPOINT como_rol');
  try {
    await admin.query(`SET LOCAL ROLE ${ROL_DEL_ENVIO}`);
    await fijarTenant(tenant);
    const r = await fn();
    await admin.query('RESET ROLE');
    await admin.query('RELEASE SAVEPOINT como_rol');
    return r;
  } catch (error) {
    await admin.query('ROLLBACK TO SAVEPOINT como_rol');
    await admin.query('RESET ROLE');
    throw error;
  }
}

describe('migración 20261104140000 — envíos sin Redis en mensajes', () => {
  it('columnas, CHECK e índice parcial con la forma del contrato', async () => {
    const { rows: columnas } = await admin.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'mensajes'
          AND column_name = ANY ($1::text[])
        ORDER BY column_name`,
      [COLUMNAS],
    );
    expect(columnas).toEqual([
      {
        column_name: 'envio_intentos',
        data_type: 'integer',
        is_nullable: 'NO',
        column_default: '0',
      },
      {
        column_name: 'envio_reservado_en',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'envio_siguiente_en',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        column_default: null,
      },
    ]);

    const { rows: indice } = await admin.query<{ def: string }>(
      `SELECT pg_get_indexdef('public.idx_mensajes_envios_pendientes'::regclass) AS def`,
    );
    expect(indice[0]?.def).toMatch(/\(tenant_id, envio_siguiente_en NULLS FIRST, id\)/);
    expect(indice[0]?.def).toMatch(/WHERE \(\(estado = 'PENDIENTE'.*AND \(wamid IS NULL\)\)/);

    // RLS intacta: la migración no abrió nada.
    const { rows: rls } = await admin.query<{ ok: boolean }>(
      `SELECT relrowsecurity AND relforcerowsecurity AS ok FROM pg_class
        WHERE oid = 'public.mensajes'::regclass`,
    );
    expect(rls[0]?.ok).toBe(true);
  });

  it('los roles de negocio leen y actualizan las columnas; el de identidad no toca mensajes', async () => {
    const { rows } = await admin.query<{ rol: string; columna: string; ok: boolean }>(
      `SELECT r.rolname AS rol, c AS columna,
              has_column_privilege(r.rolname, 'public.mensajes', c, 'SELECT')
              AND has_column_privilege(r.rolname, 'public.mensajes', c, 'UPDATE') AS ok
         FROM pg_roles r CROSS JOIN unnest($1::text[]) c
        WHERE r.rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook')`,
      [COLUMNAS],
    );
    expect(rows.length, 'los roles de aplicación deben existir en esta base').toBeGreaterThan(0);
    expect(rows.filter((r) => !r.ok)).toEqual([]);

    const { rows: identidad } = await admin.query<{ puede: boolean | null }>(
      `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_identidad')
                   THEN has_table_privilege('viajapro_identidad', 'public.mensajes', 'SELECT, UPDATE')
              END AS puede`,
    );
    expect(identidad[0]?.puede ?? false).toBe(false);
  });

  it('reclamo, arrendamiento y reserva única bajo RLS; otra agencia no alcanza nada', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      const b = await sembrar();

      // Reclamo de A: ve su pendiente y solo el suyo.
      const reclamados = await comoRol(a.tenant, async () => {
        const { rows } = await admin.query<{ id: string }>(RECLAMO, [a.tenant]);
        return rows.map((r) => r.id);
      });
      expect(reclamados).toEqual([a.mensaje]);

      // Lectura cruzada: con el contexto de B, el reclamo pidiendo A no devuelve nada.
      const cruzado = await comoRol(b.tenant, async () => {
        const { rows } = await admin.query(RECLAMO, [a.tenant]);
        return rows.length;
      });
      expect(cruzado).toBe(0);

      // Arrendamiento: intento + 1 y espera de 2 min. Mientras dure, nadie lo reclama.
      await comoRol(a.tenant, async () => {
        const { rowCount } = await admin.query(
          `UPDATE mensajes
              SET envio_intentos = envio_intentos + 1,
                  envio_siguiente_en = now() + interval '2 minutes',
                  actualizado_en = now()
            WHERE tenant_id = $1 AND id = $2`,
          [a.tenant, a.mensaje],
        );
        expect(rowCount).toBe(1);
        const { rows } = await admin.query(RECLAMO, [a.tenant]);
        expect(rows).toEqual([]);
      });

      // Reserva: la primera gana, la segunda no reserva nada. Y B no puede reservar el de A.
      const reservaCruzada = await comoRol(b.tenant, async () => {
        const { rowCount } = await admin.query(RESERVA, [a.tenant, a.mensaje]);
        return rowCount;
      });
      expect(reservaCruzada).toBe(0);

      const [primera, segunda] = await comoRol(a.tenant, async () => {
        const uno = await admin.query(RESERVA, [a.tenant, a.mensaje]);
        const dos = await admin.query(RESERVA, [a.tenant, a.mensaje]);
        return [uno.rowCount, dos.rowCount];
      });
      expect(primera).toBe(1);
      expect(segunda).toBe(0);

      // Sin contexto de tenant no se ve nada (RLS sigue en pie para la tabla).
      const sinContexto = await comoRol(null, async () => {
        const { rows } = await admin.query('SELECT id FROM mensajes WHERE id = ANY ($1::uuid[])', [
          [a.mensaje, b.mensaje],
        ]);
        return rows.length;
      });
      expect(sinContexto).toBe(0);

      // El estado de B no lo tocó nada de lo anterior.
      await fijarTenant(b.tenant);
      const { rows: deB } = await admin.query(
        `SELECT envio_reservado_en, envio_intentos, envio_siguiente_en FROM mensajes WHERE id = $1`,
        [b.mensaje],
      );
      expect(deB).toEqual([
        { envio_reservado_en: null, envio_intentos: 0, envio_siguiente_en: null },
      ]);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('un ENTRANTE no puede tener estado de envío, y los intentos no son negativos', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      await fijarTenant(a.tenant);

      await admin.query('SAVEPOINT entrante');
      await expect(
        admin.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, wamid,
                                 envio_reservado_en, ocurrido_en, actualizado_en)
           VALUES ($1, $2, $3, 'ENTRANTE', 'TEXTO', $4, now(), now(), now())`,
          [randomUUID(), a.tenant, a.conversacion, `wamid.ENVIOS.${MARCA}`],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'mensajes_envio_solo_saliente' });
      await admin.query('ROLLBACK TO SAVEPOINT entrante');

      await admin.query('SAVEPOINT negativo');
      await expect(
        admin.query('UPDATE mensajes SET envio_intentos = -1 WHERE id = $1', [a.mensaje]),
      ).rejects.toMatchObject({ code: '23514', constraint: 'mensajes_envio_intentos_no_negativo' });
      await admin.query('ROLLBACK TO SAVEPOINT negativo');
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('el reclamo usa el índice parcial', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      await admin.query('SET LOCAL enable_seqscan = off');
      const plan = await comoRol(a.tenant, async () => {
        // El tenant en literal: EXPLAIN con parámetros enlazados depende del protocolo.
        const { rows } = await admin.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN ${RECLAMO.replace('$1', `'${a.tenant}'::uuid`)}`,
        );
        return rows.map((r) => r['QUERY PLAN']).join('\n');
      });
      expect(plan).toMatch(/idx_mensajes_envios_pendientes/);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);
});
