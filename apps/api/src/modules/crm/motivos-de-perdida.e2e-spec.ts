/**
 * e2e de T-229 (motivos de pérdida por agencia) contra la aplicación ensamblada, con DOS agencias
 * de fixture: lo de A no se lista, no se edita y no se puede usar para cerrar una oportunidad de B.
 * Necesita Postgres migrado (`DATABASE_URL`) y `APP_ENV=local`, igual que `etapas.e2e-spec.ts`.
 * El atajo `x-dev-tenant-id` concede todos los permisos; el 403 por rol se verifica en el spec
 * unitario de `gestionar-motivos-de-perdida`.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();

interface Motivo {
  id: string;
  clave: string | null;
  etiqueta: string;
  orden: number;
  activo: boolean;
  exigeNota: boolean;
}

let app: INestApplication;
let base: string;
let admin: Client;

beforeAll(async () => {
  process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ??= 'token-solo-de-esta-prueba';
  admin = new Client({ connectionString: process.env['DATABASE_URL'] });
  await admin.connect();
  const bd = await admin.query('SELECT current_database() AS db');
  if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);
  for (const [id, letra] of [
    [TENANT_A, 'a'],
    [TENANT_B, 'b'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [id, `fixture-motivos-${letra}-${id.slice(-8)}`, `Agencia ${letra}`],
    );
    await admin.query(
      `INSERT INTO etapas_pipeline (id, tenant_id, nombre, orden, es_ganada, es_perdida) VALUES
         (gen_random_uuid(), $1, 'Nuevo', 0, false, false),
         (gen_random_uuid(), $1, 'Perdida', 1, false, true)`,
      [id],
    );
    await admin.query(
      `INSERT INTO motivos_de_perdida (id, tenant_id, clave, etiqueta, orden, exige_nota, actualizado_en) VALUES
         (gen_random_uuid(), $1, 'PRECIO', 'Precio alto', 0, false, now()),
         (gen_random_uuid(), $1, 'OTRO', 'Otro motivo', 1, true, now())`,
      [id],
    );
  }

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
}, 60_000);

afterAll(async () => {
  await app?.close();
  if (admin) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(new URL(ruta, import.meta.url).href)) as {
        borrarTenants: Limpiador;
      };
      await admin.query('BEGIN');
      await modulo.borrarTenants(admin, [TENANT_A, TENANT_B]);
      await admin.query('COMMIT');
    } finally {
      await admin.end();
    }
  }
});

const como = (tenant: string, ruta: string, metodo: string, cuerpo?: unknown): Promise<Response> =>
  fetch(new URL(ruta, base), {
    method: metodo,
    headers: { 'x-dev-tenant-id': tenant, 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

const RUTA = '/api/v1/crm/motivos-de-perdida';

const listar = async (tenant: string, query = ''): Promise<Motivo[]> =>
  (await (await como(tenant, `${RUTA}${query}`, 'GET')).json()) as Motivo[];

const etapaPerdida = async (tenant: string): Promise<string> => {
  const r = await admin.query<{ id: string }>(
    'SELECT id FROM etapas_pipeline WHERE tenant_id = $1 AND es_perdida',
    [tenant],
  );
  const fila = r.rows[0];
  if (!fila) throw new Error('El fixture no tiene etapa de pérdida');
  return fila.id;
};

async function nuevaOportunidad(tenant: string, telefono: string): Promise<string> {
  const c = await como(tenant, '/api/v1/crm/contactos', 'POST', { telefono });
  expect(c.status).toBe(201);
  const contacto = (await c.json()) as { id: string };
  const o = await como(tenant, '/api/v1/crm/oportunidades', 'POST', {
    contactoId: contacto.id,
    titulo: 'Viaje de prueba',
  });
  expect(o.status).toBe(201);
  return ((await o.json()) as { id: string }).id;
}

const cerrar = (tenant: string, oportunidad: string, etapaId: string, cuerpo: object) =>
  como(tenant, `/api/v1/crm/oportunidades/${oportunidad}/etapa`, 'PATCH', { etapaId, ...cuerpo });

describe('motivos de pérdida por agencia (T-229)', () => {
  it('cada agencia lista solo los suyos, activos y en orden', async () => {
    const a = await listar(TENANT_A);
    const b = await listar(TENANT_B);
    expect(a.map((m) => m.clave)).toEqual(['PRECIO', 'OTRO']);
    const idsB = new Set(b.map((m) => m.id));
    expect(a.every((m) => !idsB.has(m.id))).toBe(true);
  });

  it('crea al final, sin clave, activo y sin aparecer en otra agencia', async () => {
    const r = await como(TENANT_A, RUTA, 'POST', { etiqueta: 'Visa negada' });
    expect(r.status).toBe(201);
    const m = (await r.json()) as Motivo;
    expect(m).toMatchObject({
      etiqueta: 'Visa negada',
      clave: null,
      orden: 2,
      activo: true,
      exigeNota: false,
    });
    expect((await listar(TENANT_B)).map((x) => x.id)).not.toContain(m.id);
  });

  it('una etiqueta repetida en la agencia es 409; en otra agencia es válida', async () => {
    expect((await como(TENANT_A, RUTA, 'POST', { etiqueta: 'Precio alto' })).status).toBe(409);
    expect((await como(TENANT_B, RUTA, 'POST', { etiqueta: 'Visa negada' })).status).toBe(201);
  });

  it('desactivar lo saca de la lista por defecto y lo deja con incluirInactivos', async () => {
    const m = (await listar(TENANT_A)).find((x) => x.clave === 'PRECIO');
    const r = await como(TENANT_A, `${RUTA}/${m?.id}`, 'PATCH', { activo: false });
    expect(r.status).toBe(200);
    expect((await listar(TENANT_A)).map((x) => x.clave)).not.toContain('PRECIO');
    expect((await listar(TENANT_A, '?incluirInactivos=true')).map((x) => x.clave)).toContain(
      'PRECIO',
    );
    await como(TENANT_A, `${RUTA}/${m?.id}`, 'PATCH', { activo: true });
  });

  it('la clave no se edita (400) y un cuerpo vacío es 400', async () => {
    const [primero] = await listar(TENANT_A);
    expect((await como(TENANT_A, `${RUTA}/${primero?.id}`, 'PATCH', { clave: 'X' })).status).toBe(
      400,
    );
    expect((await como(TENANT_A, `${RUTA}/${primero?.id}`, 'PATCH', {})).status).toBe(400);
  });

  it('editar un motivo de A desde B es 404 y no lo toca', async () => {
    const [primero] = await listar(TENANT_A);
    const r = await como(TENANT_B, `${RUTA}/${primero?.id}`, 'PATCH', { etiqueta: 'Hackeado' });
    expect(r.status).toBe(404);
    expect((await listar(TENANT_A))[0]?.etiqueta).toBe(primero?.etiqueta);
  });

  it('cerrar como perdida con un motivo activo de la agencia deriva el enum', async () => {
    const oportunidad = await nuevaOportunidad(TENANT_A, '+573001110001');
    const precio = (await listar(TENANT_A)).find((m) => m.clave === 'PRECIO');
    const r = await cerrar(TENANT_A, oportunidad, await etapaPerdida(TENANT_A), {
      motivoPerdidaId: precio?.id,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ motivoPerdida: 'PRECIO' });
  });

  it('cerrar con un motivo PROPIO de la agencia guarda su id, con enum OTRO y su nota', async () => {
    const oportunidad = await nuevaOportunidad(TENANT_A, '+573001110005');
    const creado = await como(TENANT_A, RUTA, 'POST', { etiqueta: 'El hotel no acepta mascotas' });
    expect(creado.status).toBe(201);
    const propio = (await creado.json()) as { id: string; clave: string | null };
    expect(propio.clave).toBeNull();

    const r = await cerrar(TENANT_A, oportunidad, await etapaPerdida(TENANT_A), {
      motivoPerdidaId: propio.id,
      notaPerdida: 'Viajaban con su perro',
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ motivoPerdida: 'OTRO' });
    const fila = await admin.query<{ motivo_perdida: string | null; motivo_perdida_id: string }>(
      `SELECT motivo_perdida::text, motivo_perdida_id::text
         FROM oportunidades WHERE tenant_id = $1 AND id = $2`,
      [TENANT_A, oportunidad],
    );
    expect(fila.rows[0]).toEqual({ motivo_perdida: 'OTRO', motivo_perdida_id: propio.id });
  });

  it('un motivo de OTRA agencia se rechaza al cerrar (404) y no escribe nada', async () => {
    const oportunidad = await nuevaOportunidad(TENANT_B, '+573001110002');
    const deA = (await listar(TENANT_A)).find((m) => m.clave === 'PRECIO');
    const r = await cerrar(TENANT_B, oportunidad, await etapaPerdida(TENANT_B), {
      motivoPerdidaId: deA?.id,
    });
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      'MOTIVO_DE_PERDIDA_NO_ENCONTRADO',
    );
    const fila = await admin.query<{ motivo_perdida: string | null }>(
      'SELECT motivo_perdida::text FROM oportunidades WHERE tenant_id = $1 AND id = $2',
      [TENANT_B, oportunidad],
    );
    expect(fila.rows[0]?.motivo_perdida).toBeNull();
  });

  it('un motivo desactivado se rechaza (409) y uno que exige nota sin nota es 422', async () => {
    const oportunidad = await nuevaOportunidad(TENANT_A, '+573001110003');
    const perdida = await etapaPerdida(TENANT_A);
    const motivos = await listar(TENANT_A, '?incluirInactivos=true');
    const precio = motivos.find((m) => m.clave === 'PRECIO');
    const otro = motivos.find((m) => m.clave === 'OTRO');

    await como(TENANT_A, `${RUTA}/${precio?.id}`, 'PATCH', { activo: false });
    const inactivo = await cerrar(TENANT_A, oportunidad, perdida, { motivoPerdidaId: precio?.id });
    await como(TENANT_A, `${RUTA}/${precio?.id}`, 'PATCH', { activo: true });
    expect(inactivo.status).toBe(409);

    const sinNota = await cerrar(TENANT_A, oportunidad, perdida, { motivoPerdidaId: otro?.id });
    expect(sinNota.status).toBe(422);
  });

  it('sin motivoPerdidaId el enum de siempre sigue funcionando (compatibilidad)', async () => {
    const oportunidad = await nuevaOportunidad(TENANT_A, '+573001110004');
    const r = await cerrar(TENANT_A, oportunidad, await etapaPerdida(TENANT_A), {
      motivoPerdida: 'PRECIO',
    });
    expect(r.status).toBe(200);
  });
});
