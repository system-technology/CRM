/**
 * Los rellenos de la migración `20261121110000_etiquetas_por_agencia` (T-324, HU-inbox-1).
 *
 * Mismo método que `permisos-de-archivo.spec.ts`: la migración ya corrió sobre esta base cuando la
 * prueba arranca, así que se siembran agencias COMO ERAN ANTES (conversaciones con el arreglo libre
 * `etiquetas`, sin catálogo; roles sin `etiquetas.administrar`), se vuelven a ejecutar los rellenos y
 * se comprueba qué quedó. Todo dentro de una transacción que se deshace: no queda nada en la base
 * compartida.
 *
 * Se ejecutan solo los rellenos, cortados del archivo por sus marcas:
 *   - `pg_temp.uuid_v7()`, que la siembra usa;
 *   - la siembra de las tres por defecto y la copia de `conversaciones.etiquetas` (pasos 5 y 6);
 *   - la concesión de `etiquetas.administrar` al DUEÑO (paso 7, sin el CHECK: la próxima migración
 *     que amplíe el catálogo lo dejaría más estrecho que los roles reales).
 * Las tablas, la RLS y los privilegios los cubre `aislamiento.spec.ts` (bloque «T-324») y la cadena
 * desde cero de su aserción 23. Los rellenos son idempotentes: reejecutarlos sobre las agencias
 * reales de la base no cambia nada en ellas.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { ETIQUETAS_SEMBRADAS, ROLES_SEMBRADOS } from '../prisma/siembra-de-tenant.js';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: ejecuta la migración).');

const MIGRACION = fileURLToPath(
  new URL(
    '../prisma/migrations/20261121110000_etiquetas_por_agencia/migration.sql',
    import.meta.url,
  ),
);

/** Corta `sql` desde `inicio` (incluido) hasta `fin` (excluido), y exige que las dos marcas existan. */
function tramo(sql: string, inicio: string, fin: string, desde = 0): [string, number] {
  const a = sql.indexOf(inicio, desde);
  const b = a < 0 ? -1 : sql.indexOf(fin, a + inicio.length);
  if (a < 0 || b < 0) {
    throw new Error(`La migración ya no tiene el tramo «${inicio}» … «${fin}».`);
  }
  return [sql.slice(a, b), b];
}

const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10);

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
});

async function fijarTenant(tenant: string) {
  await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
}

/** Una agencia con un DUEÑO como era antes y una conversación por arreglo de etiquetas libres. */
async function sembrarAgencia(
  arreglos: Array<Array<string | null>>,
  catalogo: Array<{ nombre: string; color: string }> = [],
): Promise<{ tenant: string; conversaciones: string[] }> {
  const tenant = randomUUID();
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, now(), now())`,
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture etiquetas ${MARCA}`],
  );
  await fijarTenant(tenant);

  const dueno = ROLES_SEMBRADOS.find((r) => r.clave === 'DUENO');
  await admin.query(
    `INSERT INTO roles (id, tenant_id, nombre, clave, permisos, actualizado_en)
     VALUES ($1, $2, 'Dueño', 'DUENO', $3::text[], now()),
            ($4, $2, 'Asesor', 'ASESOR', ARRAY['bandeja.operar'], now()),
            ($5, $2, 'Propio', NULL, ARRAY['crm.escribir'], now())`,
    [
      randomUUID(),
      tenant,
      (dueno?.permisos ?? []).filter((p) => p !== 'etiquetas.administrar'),
      randomUUID(),
      randomUUID(),
    ],
  );

  const cuenta = randomUUID();
  const canal = randomUUID();
  await admin.query(
    `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'WABA de prueba', now(), now())`,
    [cuenta, tenant, `93${tenant.replace(/\D/g, '').slice(0, 12)}`],
  );
  await admin.query(
    `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, '+576000000099', now(), now())`,
    [canal, tenant, cuenta, `83${tenant.replace(/\D/g, '').slice(0, 12)}`],
  );

  const conversaciones: string[] = [];
  for (const [i, etiquetas] of arreglos.entries()) {
    const contacto = randomUUID();
    await admin.query(
      `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
       VALUES ($1, $2, $3, 'Contacto Demo', now(), now())`,
      [contacto, tenant, `+5733000001${String(i).padStart(2, '0')}`],
    );
    const id = randomUUID();
    await admin.query(
      `INSERT INTO conversaciones (id, tenant_id, contacto_id, canal_id, etiquetas, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5::text[], now(), now())`,
      [id, tenant, contacto, canal, etiquetas],
    );
    conversaciones.push(id);
  }

  for (const [i, e] of catalogo.entries()) {
    await admin.query(
      `INSERT INTO etiquetas (id, tenant_id, nombre, color, orden) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), tenant, e.nombre, e.color, 10 + i],
    );
  }
  return { tenant, conversaciones };
}

async function catalogoDe(tenant: string) {
  await fijarTenant(tenant);
  const { rows } = await admin.query<{ nombre: string; color: string }>(
    'SELECT nombre, color FROM etiquetas WHERE tenant_id = $1 ORDER BY orden, nombre',
    [tenant],
  );
  return rows;
}

async function asignadasA(tenant: string, conversacion: string): Promise<string[]> {
  await fijarTenant(tenant);
  const { rows } = await admin.query<{ nombre: string; tenant_id: string }>(
    `SELECT e.nombre, e.tenant_id
       FROM conversacion_etiquetas ce
       JOIN etiquetas e ON e.id = ce.etiqueta_id
      WHERE ce.conversacion_id = $1
      ORDER BY e.nombre COLLATE "C"`,
    [conversacion],
  );
  for (const r of rows) expect(r.tenant_id).toBe(tenant);
  return rows.map((r) => r.nombre);
}

describe('migración 20261121110000 — etiquetas por agencia', () => {
  it('siembra las tres por defecto sin duplicar, copia el arreglo libre en gris con sus asignaciones y da etiquetas.administrar solo al DUEÑO', async () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    const [uuid] = tramo(sql, 'CREATE OR REPLACE FUNCTION pg_temp.uuid_v7()', '$$;\n');
    const [relleno, finRelleno] = tramo(
      sql,
      'CREATE OR REPLACE FUNCTION pg_temp.etiquetas_heredadas',
      'ALTER TABLE "roles" DROP CONSTRAINT',
    );
    const [permiso] = tramo(
      sql,
      'DO $$',
      "SELECT aplicar_aislamiento_tenant('roles');",
      sql.indexOf('VALIDATE CONSTRAINT "roles_permisos_del_catalogo"', finRelleno),
    );

    await admin.query('BEGIN');
    try {
      const larga = 'Cotización enviada sin respuesta del cliente todavía';
      const vieja = await sembrarAgencia([
        ['VIP', 'Seguimiento'],
        [' vip ', 'pagado', '', null, 'Línea\nnueva'],
        [larga, larga],
        [],
      ]);
      // Una agencia que ya tenía «pagado» (con su color) y nada en el arreglo.
      const conPropia = await sembrarAgencia([], [{ nombre: 'pagado', color: 'rosa' }]);

      await admin.query(`${uuid}$$;\n${relleno}`);
      // Dos veces: idempotente (ni duplica catálogo ni asignaciones).
      await admin.query(relleno);
      await admin.query(permiso);

      // El contexto no queda colgado al terminar la migración.
      const { rows: ctx } = await admin.query<{ t: string | null }>(
        "SELECT current_setting('app.current_tenant', true) AS t",
      );
      expect(ctx[0]?.t ?? '').toBe('');

      const recortada = larga.slice(0, 30).trimEnd();
      expect(await catalogoDe(vieja.tenant)).toEqual([
        { nombre: 'Pagado', color: 'verde' },
        { nombre: 'Pago pendiente', color: 'ambar' },
        { nombre: 'Seguimiento', color: 'azul' },
        // Detrás de las sembradas, en gris, una por nombre normalizado (orden por clave).
        { nombre: recortada, color: 'gris' },
        { nombre: 'Línea nueva', color: 'gris' },
        { nombre: 'VIP', color: 'gris' },
      ]);

      const [c0, c1, c2, c3] = vieja.conversaciones as [string, string, string, string];
      expect(await asignadasA(vieja.tenant, c0)).toEqual(['Seguimiento', 'VIP']);
      // « vip » es «VIP»; «pagado» es la sembrada «Pagado»; vacío y NULL no son etiqueta.
      expect(await asignadasA(vieja.tenant, c1)).toEqual(['Línea nueva', 'Pagado', 'VIP']);
      expect(await asignadasA(vieja.tenant, c2)).toEqual([recortada]);
      expect(await asignadasA(vieja.tenant, c3)).toEqual([]);

      // El arreglo libre NO se toca: solo se copia.
      await fijarTenant(vieja.tenant);
      const { rows: arreglo } = await admin.query<{ etiquetas: Array<string | null> }>(
        'SELECT etiquetas FROM conversaciones WHERE id = $1',
        [c1],
      );
      expect(arreglo[0]?.etiquetas).toEqual([' vip ', 'pagado', '', null, 'Línea\nnueva']);

      // La que ya tenía «pagado» se queda con la suya y recibe las otras dos.
      expect(await catalogoDe(conPropia.tenant)).toEqual([
        { nombre: 'Pago pendiente', color: 'ambar' },
        { nombre: 'Seguimiento', color: 'azul' },
        { nombre: 'pagado', color: 'rosa' },
      ]);

      // Solo el DUEÑO recibe el permiso, una vez; ASESOR y el rol propio no cambian.
      await fijarTenant(vieja.tenant);
      const { rows: roles } = await admin.query<{ nombre: string; permisos: string[] }>(
        'SELECT nombre, permisos FROM roles WHERE tenant_id = $1 ORDER BY nombre',
        [vieja.tenant],
      );
      const porNombre = Object.fromEntries(roles.map((r) => [r.nombre, r.permisos]));
      expect(porNombre['Dueño']?.filter((p) => p === 'etiquetas.administrar')).toEqual([
        'etiquetas.administrar',
      ]);
      expect(porNombre['Asesor']).toEqual(['bandeja.operar']);
      expect(porNombre['Propio']).toEqual(['crm.escribir']);

      // El CHECK vigente lo admite en un rol propio; uno inventado lo sigue rechazando.
      await admin.query(
        `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
         VALUES ($1, $2, 'Gestiona etiquetas', ARRAY['etiquetas.administrar'], now())`,
        [randomUUID(), vieja.tenant],
      );
      await admin.query('SAVEPOINT inventado');
      await expect(
        admin.query(
          `INSERT INTO roles (id, tenant_id, nombre, permisos, actualizado_en)
           VALUES ($1, $2, 'Inventado', ARRAY['etiquetas.borrar'], now())`,
          [randomUUID(), vieja.tenant],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await admin.query('ROLLBACK TO SAVEPOINT inventado');
    } finally {
      await admin.query('ROLLBACK');
    }
  }, 60_000);

  it('la siembra de agencias nuevas trae las mismas tres que la migración, y el DUEÑO el permiso', () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    for (const e of ETIQUETAS_SEMBRADAS) {
      expect(sql, e.nombre).toMatch(
        new RegExp(`\\('${e.nombre}',\\s*'${e.color}',\\s*${String(e.orden)}\\)`),
      );
    }
    expect(ETIQUETAS_SEMBRADAS.map((e) => e.nombre)).toEqual([
      'Pagado',
      'Pago pendiente',
      'Seguimiento',
    ]);
    const dueno = ROLES_SEMBRADOS.find((r) => r.clave === 'DUENO');
    expect(dueno?.permisos).toContain('etiquetas.administrar');
    for (const r of ROLES_SEMBRADOS.filter((x) => x.clave !== 'DUENO')) {
      expect(r.permisos as readonly string[], r.clave).not.toContain('etiquetas.administrar');
    }
  });
});
