/**
 * La migración `20261104150000_historial_de_etapas_de_oportunidad` (T-131).
 *
 * El aislamiento, las foráneas y el «solo añadir» los vigila `aislamiento.spec.ts` (74 a 77). Aquí
 * se fija el CONTRATO que usan el adaptador de `crm` y los reportes:
 *   · la forma de la tabla (tipos, nulabilidad, DEFAULT del instante, enum de origen);
 *   · que el rol de la API (`viajapro_app`) escribe ALTA y CAMBIO bajo RLS y lee su línea de vida
 *     en orden, y que esa consulta usa el índice;
 *   · que el RELLENO de la migración —el bloque real, leído del archivo— deja una foto `MIGRACION`
 *     por oportunidad sin historial, con su etapa y banderas, sin origen, sin usuario, con el
 *     motivo solo si es pérdida, no duplica la de quien ya tenía historial y no toca `cerrada_en`.
 *
 * Todo dentro de una transacción que se deshace: no queda nada en la base compartida. Las
 * operaciones de la aplicación corren con `SET LOCAL ROLE`: el propietario no prueba nada, porque
 * puede saltarse RLS.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: siembra y catálogo).');

const ROL_DE_LA_API = 'viajapro_app';
const MIGRACION = fileURLToPath(
  new URL(
    '../prisma/migrations/20261104150000_historial_de_etapas_de_oportunidad/migration.sql',
    import.meta.url,
  ),
);

/** La línea de vida de una oportunidad, como la leerán los reportes. */
const LINEA_DE_VIDA = `
  SELECT origen::text AS origen, etapa_desde_id, etapa_hasta_id, es_ganada, es_perdida,
         motivo_perdida::text AS motivo_perdida, asesor_id, usuario_id
    FROM oportunidad_cambios_etapa
   WHERE tenant_id = $1 AND oportunidad_id = $2
   ORDER BY ocurrido_en, id`;

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

interface Agencia {
  tenant: string;
  usuario: string;
  viva: string;
  perdida: string;
  contacto: string;
}

/** Una agencia con un usuario, una etapa viva, una de pérdida y un contacto. Dentro de la transacción. */
async function sembrar(): Promise<Agencia> {
  const a: Agencia = {
    tenant: randomUUID(),
    usuario: randomUUID(),
    viva: randomUUID(),
    perdida: randomUUID(),
    contacto: randomUUID(),
  };
  const identidad = randomUUID();
  const rol = randomUUID();
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, now(), now())`,
    [
      a.tenant,
      `fixture-aislamiento-${MARCA}-${a.tenant.slice(0, 8)}`,
      `Fixture historial ${MARCA}`,
    ],
  );
  await admin.query(
    `INSERT INTO identidades (id, correo, nombre, actualizado_en)
     VALUES ($1, $2, 'Fixture', now())`,
    [identidad, `fixture-aislamiento-${MARCA}-${identidad.slice(0, 8)}@prueba.invalid`],
  );
  await fijarTenant(a.tenant);
  await admin.query(
    `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
     VALUES ($1, $2, 'Asesor', ARRAY['crm.escribir']::text[], now())`,
    [rol, a.tenant],
  );
  await admin.query(
    `INSERT INTO usuarios (id, tenant_id, identidad_id, rol_id, correo, nombre, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, 'Asesora', now())`,
    [a.usuario, a.tenant, identidad, rol, `u-${identidad.slice(0, 8)}@prueba.invalid`],
  );
  await admin.query(
    `INSERT INTO etapas_pipeline (id, tenant_id, nombre, orden, es_perdida, creado_en)
     VALUES ($1, $2, 'Viva', 1, false, now()), ($3, $2, 'Perdida', 2, true, now())`,
    [a.viva, a.tenant, a.perdida],
  );
  await admin.query(
    `INSERT INTO contactos (id, tenant_id, telefono_e164, creado_en, actualizado_en)
     VALUES ($1, $2, '+573001117777', now(), now())`,
    [a.contacto, a.tenant],
  );
  return a;
}

async function oportunidad(
  a: Agencia,
  etapa: string,
  extra: { motivo?: string | null; asesor?: string | null } = {},
): Promise<string> {
  const id = randomUUID();
  await fijarTenant(a.tenant);
  await admin.query(
    `INSERT INTO oportunidades (id, tenant_id, contacto_id, etapa_id, titulo, asesor_id,
                                motivo_perdida, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, 'Fixture', $5, $6::motivo_perdida, now(), now())`,
    [id, a.tenant, a.contacto, etapa, extra.asesor ?? null, extra.motivo ?? null],
  );
  return id;
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

/** El `pg_temp.uuid_v7()` y el bloque DO del relleno (§7), tal cual están en la migración. */
function relleno(): string[] {
  const sql = readFileSync(MIGRACION, 'utf8');
  const uuid = /CREATE OR REPLACE FUNCTION pg_temp\.uuid_v7\(\)[\s\S]*?\n\$\$;/.exec(sql)?.[0];
  const bloque = /-- 7\. Relleno[\s\S]*?\n(DO \$\$[\s\S]*?\n\$\$;)/.exec(sql)?.[1];
  if (!uuid || !bloque) throw new Error('No se encontró el relleno en la migración.');
  return [uuid, bloque];
}

describe('migración 20261104150000 — historial de etapas de la oportunidad', () => {
  it('la tabla tiene la forma del contrato', async () => {
    const { rows } = await admin.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, CASE WHEN data_type = 'USER-DEFINED' THEN udt_name ELSE data_type END
                AS data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'oportunidad_cambios_etapa'
        ORDER BY ordinal_position`,
    );
    expect(rows).toEqual([
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'tenant_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'oportunidad_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'origen', data_type: 'origen_cambio_etapa', is_nullable: 'NO' },
      { column_name: 'etapa_desde_id', data_type: 'uuid', is_nullable: 'YES' },
      { column_name: 'etapa_hasta_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'es_ganada', data_type: 'boolean', is_nullable: 'NO' },
      { column_name: 'es_perdida', data_type: 'boolean', is_nullable: 'NO' },
      { column_name: 'motivo_perdida', data_type: 'motivo_perdida', is_nullable: 'YES' },
      { column_name: 'asesor_id', data_type: 'uuid', is_nullable: 'YES' },
      { column_name: 'usuario_id', data_type: 'uuid', is_nullable: 'YES' },
      { column_name: 'ocurrido_en', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ]);

    // Sin texto libre: ninguna columna de texto, que es donde se cuela la PII (R10).
    const { rows: texto } = await admin.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'oportunidad_cambios_etapa'
          AND data_type IN ('text', 'character varying', 'jsonb', 'json')`,
    );
    expect(texto).toEqual([]);

    const { rows: valores } = await admin.query<{ v: string }>(
      `SELECT unnest(enum_range(NULL::origen_cambio_etapa))::text AS v`,
    );
    expect(valores.map((r) => r.v)).toEqual(['ALTA', 'CAMBIO', 'MIGRACION']);
  });

  it('la API escribe ALTA y CAMBIO bajo RLS y lee la línea de vida en orden; otra agencia no la ve', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      const b = await sembrar();
      const op = await oportunidad(a, a.viva, { asesor: a.usuario });

      const filas = await comoApi(a.tenant, async () => {
        await admin.query(
          `INSERT INTO oportunidad_cambios_etapa
             (id, tenant_id, oportunidad_id, origen, etapa_hasta_id, es_ganada, es_perdida,
              asesor_id, usuario_id, ocurrido_en)
           VALUES ($1, $2, $3, 'ALTA', $4, false, false, $5, $5, now() - interval '1 minute')`,
          [randomUUID(), a.tenant, op, a.viva, a.usuario],
        );
        await admin.query(
          `INSERT INTO oportunidad_cambios_etapa
             (id, tenant_id, oportunidad_id, origen, etapa_desde_id, etapa_hasta_id, es_ganada,
              es_perdida, motivo_perdida, asesor_id, usuario_id)
           VALUES ($1, $2, $3, 'CAMBIO', $4, $5, false, true, 'NO_RESPONDE', $6, $6)`,
          [randomUUID(), a.tenant, op, a.viva, a.perdida, a.usuario],
        );
        const { rows } = await admin.query<Record<string, unknown>>(LINEA_DE_VIDA, [a.tenant, op]);
        return rows;
      });
      expect(filas).toEqual([
        {
          origen: 'ALTA',
          etapa_desde_id: null,
          etapa_hasta_id: a.viva,
          es_ganada: false,
          es_perdida: false,
          motivo_perdida: null,
          asesor_id: a.usuario,
          usuario_id: a.usuario,
        },
        {
          origen: 'CAMBIO',
          etapa_desde_id: a.viva,
          etapa_hasta_id: a.perdida,
          es_ganada: false,
          es_perdida: true,
          motivo_perdida: 'NO_RESPONDE',
          asesor_id: a.usuario,
          usuario_id: a.usuario,
        },
      ]);

      const cruzado = await comoApi(b.tenant, async () => {
        const { rows } = await admin.query(LINEA_DE_VIDA, [a.tenant, op]);
        return rows.length;
      });
      expect(cruzado).toBe(0);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('la línea de vida usa el índice (tenant_id, oportunidad_id, ocurrido_en, id)', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      const op = await oportunidad(a, a.viva);
      await admin.query('SET LOCAL enable_seqscan = off');
      const plan = await comoApi(a.tenant, async () => {
        // Literales: EXPLAIN con parámetros enlazados depende del protocolo.
        const { rows } = await admin.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN ${LINEA_DE_VIDA.replace('$1', `'${a.tenant}'::uuid`).replace('$2', `'${op}'::uuid`)}`,
        );
        return rows.map((r) => r['QUERY PLAN']).join('\n');
      });
      expect(plan).toMatch(/idx_oportunidad_cambios_etapa_por_oportunidad/);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('el relleno de la migración deja una foto MIGRACION por oportunidad sin historial, y nada más', async () => {
    await admin.query('BEGIN');
    try {
      const a = await sembrar();
      const viva = await oportunidad(a, a.viva, { asesor: a.usuario });
      const perdida = await oportunidad(a, a.perdida, { motivo: 'PRECIO' });
      // Una perdida sin motivo (dato viejo): la foto se exime del CHECK de los CAMBIO.
      const perdidaSinMotivo = await oportunidad(a, a.perdida);
      // Una que ya tiene historial: el relleno no le añade otra fila.
      const conHistorial = await oportunidad(a, a.viva);
      await fijarTenant(a.tenant);
      await admin.query(
        `INSERT INTO oportunidad_cambios_etapa
           (id, tenant_id, oportunidad_id, origen, etapa_hasta_id, es_ganada, es_perdida)
         VALUES ($1, $2, $3, 'ALTA', $4, false, false)`,
        [randomUUID(), a.tenant, conHistorial, a.viva],
      );

      for (const sentencia of relleno()) await admin.query(sentencia);

      // El bloque deja el contexto vacío al salir: se vuelve a fijar para leer.
      await fijarTenant(a.tenant);
      const { rows } = await admin.query(
        `SELECT oportunidad_id, origen::text AS origen, etapa_desde_id, etapa_hasta_id, es_ganada,
                es_perdida, motivo_perdida::text AS motivo_perdida, asesor_id, usuario_id
           FROM oportunidad_cambios_etapa WHERE tenant_id = $1
          ORDER BY oportunidad_id, origen`,
        [a.tenant],
      );
      const foto = (oportunidadId: string, etapa: string, esPerdida: boolean) => ({
        oportunidad_id: oportunidadId,
        origen: 'MIGRACION',
        etapa_desde_id: null,
        etapa_hasta_id: etapa,
        es_ganada: false,
        es_perdida: esPerdida,
        motivo_perdida: null as string | null,
        asesor_id: null as string | null,
        usuario_id: null,
      });
      expect(rows).toEqual(
        [
          { ...foto(viva, a.viva, false), asesor_id: a.usuario },
          { ...foto(perdida, a.perdida, true), motivo_perdida: 'PRECIO' },
          foto(perdidaSinMotivo, a.perdida, true),
          { ...foto(conHistorial, a.viva, false), origen: 'ALTA' },
        ].sort((x, y) => (x.oportunidad_id < y.oportunidad_id ? -1 : 1)),
      );

      // `cerrada_en` no se inventa.
      const { rows: cerradas } = await admin.query(
        'SELECT count(*)::int AS n FROM oportunidades WHERE tenant_id = $1 AND cerrada_en IS NOT NULL',
        [a.tenant],
      );
      expect(cerradas).toEqual([{ n: 0 }]);
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);
});
