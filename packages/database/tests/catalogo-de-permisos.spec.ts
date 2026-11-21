/**
 * El catálogo de permisos tiene dos copias que deben ser IGUALES (T-505):
 *
 *   1. `PERMISOS` en `packages/contracts/src/identidad.ts` (R3: la fuente de verdad).
 *   2. El `CHECK roles_permisos_del_catalogo` de la tabla `roles`, que cada migración que añade un
 *      permiso reescribe a mano con `DROP CONSTRAINT` + `ADD CONSTRAINT`.
 *
 * Esta prueba lee la definición VIGENTE del CHECK con `pg_get_constraintdef` y la contrasta con
 * `PERMISOS` en los dos sentidos. Si estás aquí porque acabas de añadir un permiso y esto está en
 * rojo, el mensaje te dice cuál falta y en qué lado:
 *
 *   - «falta en la base»: está en `PERMISOS` pero ningún CHECK lo admite. Falta la migración que
 *     amplía `roles_permisos_del_catalogo` (patrón de 20261121160000_permiso_reportes_ver_agencia).
 *   - «falta en contratos»: la base lo admite pero `PERMISOS` no lo lista. Añádelo a
 *     `packages/contracts/src/identidad.ts` (y a `ROLES_SEMBRADOS` si algún rol sembrado lo lleva).
 *
 * `permisos-de-reportes.spec.ts` ya no repite el catálogo a mano: lo deriva de `PERMISOS`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PERMISOS } from '@viajapro/contracts';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: ejecuta la migración).');

/** Los literales de texto de una definición de CHECK: `'a.b'::text` → `a.b`. */
function literalesDelCheck(definicion: string): string[] {
  return [...definicion.matchAll(/'((?:[^']|'')*)'/g)].map((m) => (m[1] ?? '').replaceAll("''", "'"));
}

/** Qué sobra y qué falta, con un mensaje que dice el lado. Vacío si coinciden. */
function diferencias(contratos: readonly string[], base: readonly string[]): string[] {
  const enContratos = new Set(contratos);
  const enBase = new Set(base);
  return [
    ...contratos
      .filter((p) => !enBase.has(p))
      .map(
        (p) =>
          `«${p}» falta en la base: está en PERMISOS (packages/contracts/src/identidad.ts) pero el CHECK roles_permisos_del_catalogo no lo admite. Falta la migración que lo amplía.`,
      ),
    ...base
      .filter((p) => !enContratos.has(p))
      .map(
        (p) =>
          `«${p}» falta en contratos: el CHECK roles_permisos_del_catalogo lo admite pero PERMISOS (packages/contracts/src/identidad.ts) no lo lista.`,
      ),
  ];
}

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
});

describe('catálogo de permisos: el CHECK de la base y PERMISOS de contratos', () => {
  it('el CHECK vigente admite exactamente los permisos de PERMISOS, ni uno más ni uno menos', async () => {
    const { rows } = await admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.roles'::regclass AND conname = 'roles_permisos_del_catalogo'`,
    );
    expect(rows, 'no existe el CHECK roles_permisos_del_catalogo en roles').toHaveLength(1);
    const def = rows[0]?.def ?? '';
    // `<@ ARRAY[...]`: los únicos literales del CHECK son los permisos (`::text` no es literal).
    const base = literalesDelCheck(def);
    expect(base.length, `no pude leer ningún permiso del CHECK: ${def}`).toBeGreaterThan(0);

    const sinDuplicados = (xs: readonly string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
    expect(sinDuplicados(PERMISOS), 'PERMISOS tiene un permiso repetido').toEqual([]);
    expect(sinDuplicados(base), 'el CHECK tiene un permiso repetido').toEqual([]);

    expect(diferencias(PERMISOS, base).join('\n')).toBe('');
  });

  describe('el comparador (no necesita base)', () => {
    it('dice qué falta y de qué lado, en los dos sentidos', () => {
      const d = diferencias(['a.x', 'b.y'], ['a.x', 'c.z']);
      expect(d).toHaveLength(2);
      expect(d[0]).toContain('«b.y» falta en la base');
      expect(d[1]).toContain('«c.z» falta en contratos');
      expect(diferencias(['a.x'], ['a.x'])).toEqual([]);
    });

    it('extrae los literales de una definición real de CHECK', () => {
      const def =
        'CHECK (((permisos <@ ARRAY[\'a.x\'::text, \'b.y\'::text]) AND (array_position(permisos, NULL::text) IS NULL)))';
      expect(literalesDelCheck(def)).toEqual(['a.x', 'b.y']);
    });
  });
});
