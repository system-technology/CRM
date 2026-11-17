/**
 * El relleno de la migración `20261118100000_permisos_del_archivo_de_viaje` (T-249, ADR-0024 §3.7).
 *
 * Mismo método que `permisos-de-mutacion.spec.ts`: la migración ya corrió sobre esta base cuando la
 * prueba arranca, así que se siembran agencias con los roles COMO ERAN ANTES (sin `archivo.ver` ni
 * `archivo.operar`, o con alguno ya puesto a mano), se vuelve a ejecutar el relleno y se comprueba
 * qué recibió cada rol. Todo dentro de una transacción que se deshace.
 *
 * Se ejecuta solo el relleno: desde el primer `DO $$` hasta la reaplicación del aislamiento (que
 * bloquea todas las tablas y ya cubre la cadena desde cero de `aislamiento.spec.ts`). El CHECK no
 * se reejecuta —la próxima migración que amplíe el catálogo lo dejaría más estrecho que los roles
 * reales—: que admita los dos permisos nuevos se comprueba contra el CHECK vigente. El relleno es
 * idempotente: reejecutarlo sobre las agencias reales de la base no cambia nada en ellas.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { ROLES_SEMBRADOS } from '../prisma/siembra-de-tenant.js';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: ejecuta la migración).');

const MIGRACION = fileURLToPath(
  new URL(
    '../prisma/migrations/20261118100000_permisos_del_archivo_de_viaje/migration.sql',
    import.meta.url,
  ),
);
const INICIO = 'DO $$';
const CORTE = 'SELECT aplicar_aislamiento_tenant(';

const ARCHIVO = ['archivo.ver', 'archivo.operar'];
const ESCRITURA_T089 = ['bandeja.operar', 'crm.escribir', 'cotizacion.escribir'];
const DUENO_ANTES = [
  'cotizacion.ver_neto_y_margen',
  'usuarios.administrar',
  'roles.administrar',
  'conversaciones.ver_todas',
  'catalogo.administrar',
  ...ESCRITURA_T089,
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
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture archivo ${MARCA}`],
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

describe('migración 20261118100000 — permisos del archivo de viaje', () => {
  it('DUENO, ASESOR y OPERACIONES reciben los dos sin duplicar ni perder nada; los propios no cambian', async () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    const inicio = sql.indexOf(INICIO);
    const corte = sql.indexOf(CORTE);
    expect(inicio, 'la migración ya no tiene el bloque de relleno').toBeGreaterThan(0);
    expect(
      corte,
      'la migración ya no reaplica el aislamiento donde esta prueba corta',
    ).toBeGreaterThan(inicio);

    await admin.query('BEGIN');
    try {
      const vieja = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Dueño', permisos: DUENO_ANTES },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: ESCRITURA_T089 },
        { clave: 'OPERACIONES', nombre: 'Operaciones', permisos: OPERACIONES_ANTES },
        { clave: null, nombre: 'Propio', permisos: ['crm.escribir'] },
      ]);
      // Una agencia en la que alguien ya concedió parte (o todo) a mano.
      const parcial = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Dueño', permisos: [...DUENO_ANTES, ...ARCHIVO] },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: ['archivo.operar'] },
        { clave: 'OPERACIONES', nombre: 'Operaciones', permisos: [] },
      ]);

      await admin.query(sql.slice(inicio, corte));

      // El contexto no queda colgado al terminar la migración (se lee antes de cualquier otro
      // set_config de esta prueba).
      const { rows } = await admin.query<{ t: string | null }>(
        "SELECT current_setting('app.current_tenant', true) AS t",
      );
      expect(rows[0]?.t ?? '').toBe('');

      expect(await permisosPorNombre(vieja)).toEqual({
        Dueño: [...DUENO_ANTES, ...ARCHIVO],
        Asesor: [...ESCRITURA_T089, ...ARCHIVO],
        // OPERACIONES opera archivos (ADR-0024 §3.7) y sigue sin los de escritura de T-089.
        Operaciones: [...OPERACIONES_ANTES, ...ARCHIVO],
        Propio: ['crm.escribir'],
      });
      expect(await permisosPorNombre(parcial)).toEqual({
        Dueño: [...DUENO_ANTES, ...ARCHIVO],
        Asesor: ['archivo.operar', 'archivo.ver'],
        Operaciones: ARCHIVO,
      });

      // Los dos nuevos son asignables a un rol propio; uno inventado lo sigue rechazando la base.
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [vieja]);
      await admin.query(
        `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
         VALUES ($1, $2, 'Solo ver archivos', ARRAY['archivo.ver'], now())`,
        [randomUUID(), vieja],
      );
      await admin.query('SAVEPOINT inventado');
      await expect(
        admin.query(
          `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
           VALUES ($1, $2, 'Inventado', ARRAY['archivo.borrar'], now())`,
          [randomUUID(), vieja],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await admin.query('ROLLBACK TO SAVEPOINT inventado');
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('la siembra de agencias nuevas da los dos a los tres roles sembrados, y nada de T-089 a OPERACIONES', () => {
    for (const rol of ROLES_SEMBRADOS) {
      expect(rol.permisos, rol.clave).toEqual(expect.arrayContaining(ARCHIVO));
    }
    const operaciones = ROLES_SEMBRADOS.find((r) => r.clave === 'OPERACIONES');
    expect((operaciones?.permisos ?? []).filter((p: string) => ESCRITURA_T089.includes(p))).toEqual(
      [],
    );
  });
});
