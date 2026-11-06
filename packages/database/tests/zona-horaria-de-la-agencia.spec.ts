/**
 * La migración `20261104170000_funcion_zona_horaria_de_la_agencia`.
 *
 * `tenants` es global (excepción de RLS) y `viajapro_app` solo la lee. El `PATCH
 * /api/v1/agencia/ajustes` cambia la zona horaria con
 * `public.actualizar_zona_horaria_de_la_agencia(zona text) RETURNS text`, que toma la agencia de
 * `app.current_tenant` y nunca de un parámetro. Aquí se fija el CONTRATO que traduce la API:
 *
 *   · éxito → la zona guardada, y `actualizado_en` avanza.
 *   · 22023 `zona_horaria_invalida: ...` → 422 (NULL, desconocida, o alias posix/ right/ ...).
 *   · 42501 `agencia_sin_contexto: ...` → 500 (contexto ausente, vacío o no uuid).
 *   · P0002 `agencia_inexistente: ...` → el uuid del contexto no es ninguna agencia.
 *
 * Todo dentro de una transacción que se deshace, con `SET LOCAL ROLE viajapro_app`: el
 * propietario no prueba nada, porque puede escribir `tenants` sin la función.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario: siembra y catálogo).');

const ROL_DE_LA_API = 'viajapro_app';
const FUNCION = 'public.actualizar_zona_horaria_de_la_agencia';
const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10);

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
});

/** Una agencia en Bogotá, como propietario y dentro de la transacción de la prueba. */
async function sembrarAgencia(): Promise<string> {
  const tenant = randomUUID();
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, zona_horaria, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'America/Bogota', now() - interval '1 day', now() - interval '1 day')`,
    [tenant, `fixture-aislamiento-${MARCA}-${tenant.slice(0, 8)}`, `Fixture zona ${MARCA}`],
  );
  return tenant;
}

async function zonaDe(tenant: string): Promise<{ zona: string; actualizado: Date }> {
  const { rows } = await admin.query<{ zona_horaria: string; actualizado_en: Date }>(
    'SELECT zona_horaria, actualizado_en FROM tenants WHERE id = $1',
    [tenant],
  );
  const fila = rows[0];
  if (!fila) throw new Error(`No existe la agencia ${tenant}`);
  return { zona: fila.zona_horaria, actualizado: fila.actualizado_en };
}

/**
 * Como la API: el rol de conexión y el contexto con SET LOCAL. `contexto === undefined` no toca
 * el GUC; `null` lo fija vacío. Con punto de guardado, para que un error no aborte la
 * transacción de la prueba.
 */
async function comoApi<T>(contexto: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  await admin.query('SAVEPOINT como_api');
  try {
    await admin.query(`SET LOCAL ROLE ${ROL_DE_LA_API}`);
    if (contexto !== undefined) {
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [contexto ?? '']);
    }
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

const cambiar = (zona: string | null) =>
  admin.query<{ zona: string }>(`SELECT ${FUNCION}($1) AS zona`, [zona]);

async function enTransaccion(fn: () => Promise<void>): Promise<void> {
  await admin.query('BEGIN');
  try {
    await fn();
  } finally {
    await admin.query('ROLLBACK');
  }
}

describe('migración 20261104170000 — zona horaria de la agencia por función', () => {
  it('la agencia A cambia su zona, actualizado_en avanza y B no se mueve', async () => {
    await enTransaccion(async () => {
      const a = await sembrarAgencia();
      const b = await sembrarAgencia();
      const antesA = await zonaDe(a);

      const { rows } = await comoApi(a, () => cambiar('America/Lima'));
      expect(rows).toEqual([{ zona: 'America/Lima' }]);

      const despuesA = await zonaDe(a);
      expect(despuesA.zona).toBe('America/Lima');
      expect(despuesA.actualizado.getTime()).toBeGreaterThan(antesA.actualizado.getTime());
      expect((await zonaDe(b)).zona).toBe('America/Bogota');
    });
  }, 60_000);

  it('con el contexto de A es imposible tocar B, y el UPDATE directo sigue denegado', async () => {
    await enTransaccion(async () => {
      const a = await sembrarAgencia();
      const b = await sembrarAgencia();
      const antesB = await zonaDe(b);

      // La función no admite agencia: la única forma de «pedir» B sería el contexto.
      await comoApi(a, () => cambiar('Europe/Madrid'));
      expect(await zonaDe(b)).toEqual(antesB);

      // El atajo que esta migración evita: UPDATE de tenants con el rol de la API.
      for (const sql of [
        `UPDATE tenants SET zona_horaria = 'Europe/Madrid' WHERE id = '${b}'`,
        `UPDATE tenants SET zona_horaria = 'Europe/Madrid'`,
        `UPDATE tenants SET actualizado_en = now() WHERE id = '${a}'`,
      ]) {
        await expect(
          comoApi(a, () => admin.query(sql)),
          sql,
        ).rejects.toMatchObject({
          code: '42501',
        });
      }
      expect(await zonaDe(b)).toEqual(antesB);
    });
  }, 60_000);

  it('sin contexto, contexto vacío o que no es un uuid canónico → 42501 agencia_sin_contexto', async () => {
    await enTransaccion(async () => {
      const a = await sembrarAgencia();
      const casos: Array<[string, string | null | undefined]> = [
        ['GUC vacío', null],
        ['solo espacios', '   '],
        ['texto', 'agencia-a'],
        ['uuid sin guiones', a.replace(/-/g, '')],
        ['uuid entre llaves', `{${a}}`],
        ['uuid y basura', `${a}; x`],
      ];
      for (const [caso, contexto] of casos) {
        await expect(
          comoApi(contexto, () => cambiar('Europe/Madrid')),
          caso,
        ).rejects.toMatchObject({
          code: '42501',
          message: expect.stringMatching(/^agencia_sin_contexto:/),
        });
      }
      expect((await zonaDe(a)).zona).toBe('America/Bogota');
    });
  }, 60_000);

  it('uuid bien formado que no es ninguna agencia → P0002 agencia_inexistente', async () => {
    await enTransaccion(async () => {
      await expect(comoApi(randomUUID(), () => cambiar('Europe/Madrid'))).rejects.toMatchObject({
        code: 'P0002',
        message: expect.stringMatching(/^agencia_inexistente:/),
      });
    });
  }, 60_000);

  it('zona NULL, desconocida, mal escrita o alias que Node no conoce → 22023 zona_horaria_invalida', async () => {
    await enTransaccion(async () => {
      const a = await sembrarAgencia();
      for (const zona of [
        null,
        '',
        'Marte/Olympus_Mons',
        'america/bogota',
        ' America/Bogota',
        'posix/America/Bogota',
        'right/America/Bogota',
        'localtime',
        'posixrules',
        'Factory',
      ]) {
        await expect(
          comoApi(a, () => cambiar(zona)),
          String(zona),
        ).rejects.toMatchObject({
          code: '22023',
          message: expect.stringMatching(/^zona_horaria_invalida:/),
        });
      }
      expect((await zonaDe(a)).zona).toBe('America/Bogota');

      // Y las que sí: canónicas del tzdata, también UTC.
      for (const zona of ['UTC', 'Europe/Madrid', 'America/Argentina/Buenos_Aires']) {
        const { rows } = await comoApi(a, () => cambiar(zona));
        expect(rows[0]?.zona).toBe(zona);
      }
    });
  }, 60_000);

  it('solo viajapro_app la ejecuta; es SECURITY DEFINER con search_path vacío y dueña viajapro_ajustes', async () => {
    const { rows } = await admin.query<{
      dueno: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      resultado: string;
      publico: boolean;
    }>(
      `SELECT pg_get_userbyid(p.proowner) AS dueno, p.prosecdef, p.proconfig,
              pg_get_function_result(p.oid) AS resultado,
              has_function_privilege('public', p.oid, 'EXECUTE') AS publico
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'actualizar_zona_horaria_de_la_agencia'`,
    );
    expect(rows.length).toBe(1);
    const f = rows[0];
    if (!f) throw new Error('actualizar_zona_horaria_de_la_agencia no existe');
    expect(f.dueno).toBe('viajapro_ajustes');
    expect(f.prosecdef).toBe(true);
    expect(f.resultado).toBe('text');
    expect(f.publico).toBe(false);
    const ruta = (f.proconfig ?? []).find((c) => c.startsWith('search_path='));
    expect((ruta ?? 'ausente').slice('search_path='.length).replace(/"/g, '')).toBe('');

    const { rows: ejecutan } = await admin.query<{ rol: string; puede: boolean }>(
      `SELECT r.rolname AS rol,
              has_function_privilege(r.rolname,
                'public.actualizar_zona_horaria_de_la_agencia(text)', 'EXECUTE') AS puede
       FROM pg_roles r
       WHERE r.rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
       ORDER BY 1`,
    );
    expect(ejecutan.length, 'los roles de aplicación deben existir en esta base').toBeGreaterThan(
      0,
    );
    expect(ejecutan.filter((r) => r.puede).map((r) => r.rol)).toEqual(['viajapro_app']);

    // Comportamiento, no solo catálogo: el pool de identidad no puede llamarla.
    await enTransaccion(async () => {
      const a = await sembrarAgencia();
      await admin.query('SAVEPOINT identidad');
      await admin.query('SET LOCAL ROLE viajapro_identidad');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [a]);
      await expect(cambiar('Europe/Madrid')).rejects.toMatchObject({ code: '42501' });
      await admin.query('ROLLBACK TO SAVEPOINT identidad');
      await admin.query('RESET ROLE');
    });
  }, 60_000);
});
