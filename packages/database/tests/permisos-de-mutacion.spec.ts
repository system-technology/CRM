/**
 * El relleno de la migración `20261104130000_permisos_de_mutacion_rbac` (T-089).
 *
 * La migración ya corrió sobre esta base cuando la prueba arranca, así que no basta con mirar el
 * estado: se siembran agencias con los roles COMO ERAN ANTES (sin los permisos de escritura, o con
 * alguno ya puesto a mano), se vuelve a ejecutar el relleno y se comprueba qué recibió cada rol.
 * Todo dentro de una transacción que se deshace: no queda nada en la base compartida.
 *
 * Se ejecuta solo la parte de la migración anterior a la reaplicación del aislamiento
 * (`aplicar_aislamiento_tenant`/`aplicar_privilegios_declarados` bloquean todas las tablas, y esa
 * parte ya la cubre la cadena desde cero de `aislamiento.spec.ts`). El relleno es idempotente, así
 * que reejecutarlo sobre las agencias reales de la base no cambia nada en ellas.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: ejecuta la migración).');

const MIGRACION = fileURLToPath(
  new URL(
    '../prisma/migrations/20261104130000_permisos_de_mutacion_rbac/migration.sql',
    import.meta.url,
  ),
);
const CORTE = 'SELECT aplicar_aislamiento_tenant(';

const ESCRITURA = ['bandeja.operar', 'crm.escribir', 'cotizacion.escribir'];
const DUENO_ANTES = [
  'cotizacion.ver_neto_y_margen',
  'usuarios.administrar',
  'roles.administrar',
  'conversaciones.ver_todas',
  'catalogo.administrar',
];
const OPERACIONES_ANTES = ['conversaciones.ver_todas', 'catalogo.administrar'];

const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10);

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
});

async function sembrarAgencia(
  roles: { clave: string | null; nombre: string; permisos: string[] }[],
): Promise<string> {
  const tenant = randomUUID();
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, now(), now())`,
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture permisos ${MARCA}`],
  );
  await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
  for (const r of roles) {
    await admin.query(
      `INSERT INTO roles (id, tenant_id, nombre, clave, permisos, actualizado_en)
       VALUES ($1, $2, $3, $4, $5::text[], now())`,
      [randomUUID(), tenant, r.nombre, r.clave, r.permisos],
    );
  }
  return tenant;
}

async function permisosPorNombre(tenant: string): Promise<Record<string, string[]>> {
  await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
  const { rows } = await admin.query<{ nombre: string; permisos: string[] }>(
    'SELECT nombre, permisos FROM roles WHERE tenant_id = $1',
    [tenant],
  );
  return Object.fromEntries(rows.map((r) => [r.nombre, r.permisos]));
}

describe('migración 20261104130000 — permisos de mutación', () => {
  it('DUENO y ASESOR reciben los tres sin duplicar ni perder nada; OPERACIONES y los propios no cambian', async () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    const corte = sql.indexOf(CORTE);
    expect(
      corte,
      'la migración ya no reaplica el aislamiento donde esta prueba corta',
    ).toBeGreaterThan(0);

    await admin.query('BEGIN');
    try {
      const vieja = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Dueño', permisos: DUENO_ANTES },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: [] },
        { clave: 'OPERACIONES', nombre: 'Operaciones', permisos: OPERACIONES_ANTES },
        { clave: null, nombre: 'Propio', permisos: ['conversaciones.ver_todas'] },
      ]);
      // Una agencia en la que alguien ya concedió parte (o todo) a mano.
      const parcial = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Dueño', permisos: [...DUENO_ANTES, ...ESCRITURA] },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: ['crm.escribir'] },
        { clave: 'OPERACIONES', nombre: 'Operaciones', permisos: [] },
      ]);

      await admin.query(sql.slice(0, corte));

      expect(await permisosPorNombre(vieja)).toEqual({
        Dueño: [...DUENO_ANTES, ...ESCRITURA],
        Asesor: ESCRITURA,
        Operaciones: OPERACIONES_ANTES,
        Propio: ['conversaciones.ver_todas'],
      });
      expect(await permisosPorNombre(parcial)).toEqual({
        Dueño: [...DUENO_ANTES, ...ESCRITURA],
        Asesor: ['crm.escribir', 'bandeja.operar', 'cotizacion.escribir'],
        Operaciones: [],
      });

      // El contexto no queda colgado al terminar la migración.
      const { rows } = await admin.query<{ t: string | null }>(
        "SELECT current_setting('app.current_tenant', true) AS t",
      );
      expect(rows[0]?.t ?? '').toBe('');

      // Y el catálogo cerrado sigue cerrado: uno inventado lo rechaza la base.
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [vieja]);
      await admin.query('SAVEPOINT inventado');
      await expect(
        admin.query(
          `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
           VALUES ($1, $2, 'Inventado', ARRAY['bandeja.escribir'], now())`,
          [randomUUID(), vieja],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await admin.query('ROLLBACK TO SAVEPOINT inventado');
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);
});
