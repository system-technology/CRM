/**
 * El permiso `reportes.ver_agencia` de la migración `20261121160000_permiso_reportes_ver_agencia`
 * (T-341, ADR-0035 §3).
 *
 * Mismo método que `permisos-de-archivo.spec.ts` y que P-PERM de `aislamiento.spec.ts`: la
 * migración ya corrió sobre esta base cuando la prueba arranca, así que se siembran agencias con
 * los roles COMO ERAN ANTES (sin el permiso, o con él ya puesto a mano), se vuelve a ejecutar el
 * bloque de relleno —acotado por las marcas `[relleno-reportes]`— y se comprueba qué recibió cada
 * rol. Todo dentro de una transacción que se deshace.
 *
 * Se ejecuta SOLO el relleno: el `CHECK` no se reejecuta, porque la próxima migración que amplíe
 * el catálogo lo dejaría más estrecho que los roles reales. Que el catálogo admita el permiso
 * nuevo y conserve los catorce anteriores se comprueba contra el CHECK VIGENTE.
 *
 * Lo que vigila, en una frase: que el nivel «agencia» llegue al rol `DUENO` de cada agencia y **a
 * nadie más** —ni `ASESOR` ni `OPERACIONES`, ni los roles que creó la agencia—, que la ausencia del
 * permiso siga siendo el nivel «propio» (no existe `reportes.ver_propio`), y que el relleno no
 * pueda tocar una agencia sin su contexto.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PERMISOS } from '@viajapro/contracts';
import { ROLES_SEMBRADOS } from '../prisma/siembra-de-tenant.js';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: ejecuta la migración).');

const MIGRACION = fileURLToPath(
  new URL(
    '../prisma/migrations/20261121160000_permiso_reportes_ver_agencia/migration.sql',
    import.meta.url,
  ),
);
const MARCA_INICIO = '-- [relleno-reportes]';
const MARCA_FIN = '-- [/relleno-reportes]';

const REPORTES = 'reportes.ver_agencia';

/**
 * El catálogo anterior a esta migración: el vigente (`PERMISOS`, la fuente de verdad de R3) menos
 * el permiso nuevo. Ya no se repite a mano: que el CHECK y `PERMISOS` coincidan lo comprueba
 * `catalogo-de-permisos.spec.ts`.
 */
const CATALOGO_ANTERIOR: string[] = PERMISOS.filter((p) => p !== REPORTES);

/** Lo que tenía `DUENO` ANTES de esta migración: es una foto histórica, no el catálogo vigente. */
const DUENO_ANTES = [
  'cotizacion.ver_neto_y_margen',
  'usuarios.administrar',
  'roles.administrar',
  'conversaciones.ver_todas',
  'catalogo.administrar',
  'bandeja.operar',
  'crm.escribir',
  'cotizacion.escribir',
  'archivo.ver',
  'archivo.operar',
  'etiquetas.administrar',
  'cobro.ver',
  'cobro.registrar',
  'cobro.corregir',
];
const ASESOR_ANTES = [
  'bandeja.operar',
  'crm.escribir',
  'cotizacion.escribir',
  'archivo.ver',
  'archivo.operar',
  'cobro.ver',
  'cobro.registrar',
];
const OPERACIONES_ANTES = [
  'conversaciones.ver_todas',
  'catalogo.administrar',
  'archivo.ver',
  'archivo.operar',
  'cobro.ver',
];

const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10);

let admin: Client;
let relleno: string;

beforeAll(async () => {
  const sql = readFileSync(MIGRACION, 'utf8');
  const inicio = sql.indexOf(MARCA_INICIO);
  const fin = sql.indexOf(MARCA_FIN);
  if (inicio < 0 || fin <= inicio) {
    throw new Error('la migración perdió las marcas [relleno-reportes]');
  }
  relleno = sql.slice(inicio, fin);

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
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture reportes ${MARCA}`],
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

describe('migración 20261121160000 — el permiso reportes.ver_agencia', () => {
  it('el catálogo cerrado admite el permiso, está validado y conserva los catorce anteriores', async () => {
    const { rows } = await admin.query<{ def: string; convalidated: boolean }>(
      `SELECT pg_get_constraintdef(oid) AS def, convalidated FROM pg_constraint
        WHERE conrelid = 'public.roles'::regclass AND conname = 'roles_permisos_del_catalogo'`,
    );
    expect(rows[0]?.convalidated, 'el CHECK quedó NOT VALID').toBe(true);
    expect(rows[0]?.def ?? '').toContain(`'${REPORTES}'`);
    for (const p of CATALOGO_ANTERIOR) {
      expect(rows[0]?.def ?? '', p).toContain(`'${p}'`);
    }
    // No existe un permiso para el nivel propio: su ausencia ES el nivel (ADR-0035, opción D).
    expect(rows[0]?.def ?? '').not.toContain('reportes.ver_propio');
  });

  it('el relleno se lo da al DUENO de cada agencia y a nadie más; los roles propios no se tocan', async () => {
    await admin.query('BEGIN');
    try {
      const vieja = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Dueño', permisos: DUENO_ANTES },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: ASESOR_ANTES },
        { clave: 'OPERACIONES', nombre: 'Operaciones', permisos: OPERACIONES_ANTES },
        { clave: null, nombre: 'Propio', permisos: ['crm.escribir'] },
      ]);
      // Una agencia en la que alguien ya se lo concedió a mano al dueño, y que renombró su rol.
      const parcial = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Gerencia', permisos: [...DUENO_ANTES, REPORTES] },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: ASESOR_ANTES },
        // Un rol propio al que la agencia ya le dio el permiso desde Ajustes: sigue con él.
        { clave: null, nombre: 'Coordinación', permisos: ['conversaciones.ver_todas', REPORTES] },
      ]);
      // Una agencia que recompuso sus roles y no tiene DUENO: el relleno no inventa ninguno.
      const sinDueno = await sembrarAgencia([
        { clave: null, nombre: 'Socia', permisos: ['usuarios.administrar'] },
      ]);

      await admin.query(relleno);

      // El contexto no queda colgado (se lee antes de cualquier otro set_config de esta prueba).
      const { rows } = await admin.query<{ t: string | null }>(
        "SELECT current_setting('app.current_tenant', true) AS t",
      );
      expect(rows[0]?.t ?? '', 'el relleno dejó el contexto fijado').toBe('');

      expect(await permisosPorNombre(vieja)).toEqual({
        Dueño: [...DUENO_ANTES, REPORTES],
        // Sin el permiso: «propio» es su ausencia, no otro permiso (ADR-0035 §3).
        Asesor: ASESOR_ANTES,
        Operaciones: OPERACIONES_ANTES,
        Propio: ['crm.escribir'],
      });
      // Idempotente: al dueño que ya lo tenía no se lo duplica ni se le reordenan los suyos.
      expect(await permisosPorNombre(parcial)).toEqual({
        Gerencia: [...DUENO_ANTES, REPORTES],
        Asesor: ASESOR_ANTES,
        Coordinación: ['conversaciones.ver_todas', REPORTES],
      });
      expect(await permisosPorNombre(sinDueno)).toEqual({ Socia: ['usuarios.administrar'] });

      // Reejecutarlo no cambia nada (es lo que pasa cuando la prueba corre sobre la base real).
      await admin.query(relleno);
      expect(await permisosPorNombre(vieja)).toEqual({
        Dueño: [...DUENO_ANTES, REPORTES],
        Asesor: ASESOR_ANTES,
        Operaciones: OPERACIONES_ANTES,
        Propio: ['crm.escribir'],
      });
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('el relleno ABORTA si un ASESOR u OPERACIONES acaba con el permiso, y es asignable a un rol propio', async () => {
    await admin.query('BEGIN');
    try {
      const tenant = await sembrarAgencia([
        { clave: 'DUENO', nombre: 'Dueño', permisos: DUENO_ANTES },
        { clave: 'ASESOR', nombre: 'Asesor', permisos: ASESOR_ANTES },
      ]);

      // Un rol propio sí puede llevarlo: la agencia compone sus roles (R12).
      await admin.query(
        `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
         VALUES ($1, $2, 'Dirección comercial', ARRAY[$3]::text[], now())`,
        [randomUUID(), tenant, REPORTES],
      );

      // Un permiso inventado lo sigue rechazando la base, aunque se parezca al nuevo.
      await admin.query('SAVEPOINT inventado');
      await expect(
        admin.query(
          `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
           VALUES ($1, $2, 'Inventado', ARRAY['reportes.ver_propio']::text[], now())`,
          [randomUUID(), tenant],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await admin.query('ROLLBACK TO SAVEPOINT inventado');

      // Si alguien se lo cuela al rol sembrado ASESOR, el cinturón del relleno lo detecta y la
      // migración no termina en verde.
      await admin.query('SAVEPOINT asesor_de_mas');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
      await admin.query(
        `UPDATE roles SET permisos = permisos || ARRAY[$1]::text[]
          WHERE tenant_id = $2 AND clave = 'ASESOR'`,
        [REPORTES, tenant],
      );
      await expect(admin.query(relleno)).rejects.toMatchObject({
        message: expect.stringContaining('ASESOR/OPERACIONES'),
      });
      await admin.query('ROLLBACK TO SAVEPOINT asesor_de_mas');
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('la siembra de agencias nuevas se lo da a DUENO y solo a DUENO', () => {
    for (const rol of ROLES_SEMBRADOS) {
      const lo_tiene = (rol.permisos as readonly string[]).includes(REPORTES);
      expect(lo_tiene, rol.clave).toBe(rol.clave === 'DUENO');
    }
    // Y nadie siembra un permiso de nivel propio que no existe.
    for (const rol of ROLES_SEMBRADOS) {
      expect(
        (rol.permisos as readonly string[]).filter((p) => p.startsWith('reportes.')),
        rol.clave,
      ).toEqual(rol.clave === 'DUENO' ? [REPORTES] : []);
    }
  });
});
