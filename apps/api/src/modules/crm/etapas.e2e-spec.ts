/**
 * e2e de T-120 (etapas del pipeline) contra la aplicación ensamblada, con DOS agencias de
 * fixture para probar el aislamiento: lo de A no se lista, no se edita y no se reordena desde B.
 * Necesita Postgres migrado (`DATABASE_URL`) y `APP_ENV=local`, igual que `crm.e2e-spec.ts`.
 * El atajo `x-dev-tenant-id` concede todos los permisos; el 403 por rol se verifica en el
 * spec unitario de `gestionar-etapas`.
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

interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  clave: string | null;
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
      [id, `fixture-etapas-${letra}-${id.slice(-8)}`, `Agencia ${letra}`],
    );
    await admin.query(
      `INSERT INTO etapas_pipeline (id, tenant_id, nombre, orden, es_ganada, es_perdida) VALUES
         (gen_random_uuid(), $1, 'Nuevo', 0, false, false),
         (gen_random_uuid(), $1, 'Cerrada', 1, true, false)`,
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
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
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

const listar = async (tenant: string): Promise<Etapa[]> =>
  (await (await como(tenant, '/api/v1/crm/etapas', 'GET')).json()) as Etapa[];

describe('etapas del pipeline (T-120)', () => {
  it('cada agencia lista solo las suyas, en orden', async () => {
    const a = await listar(TENANT_A);
    const b = await listar(TENANT_B);
    expect(a.map((e) => e.nombre)).toEqual(['Nuevo', 'Cerrada']);
    const idsB = new Set(b.map((e) => e.id));
    expect(a.every((e) => !idsB.has(e.id))).toBe(true);
  });

  it('crea al final y sin clave, sin aparecer en otra agencia', async () => {
    const r = await como(TENANT_A, '/api/v1/crm/etapas', 'POST', {
      nombre: 'Esperando anticipo',
      probabilidad: 60,
    });
    expect(r.status).toBe(201);
    const e = (await r.json()) as Etapa;
    expect(e).toMatchObject({ nombre: 'Esperando anticipo', orden: 2, clave: null });
    expect((await listar(TENANT_B)).map((x) => x.id)).not.toContain(e.id);
  });

  it('editar una etapa de A desde B es 404 y no la toca', async () => {
    const [primera] = await listar(TENANT_A);
    const r = await como(TENANT_B, `/api/v1/crm/etapas/${primera?.id}`, 'PATCH', {
      nombre: 'Hackeada',
    });
    expect(r.status).toBe(404);
    expect((await listar(TENANT_A))[0]?.nombre).toBe('Nuevo');
  });

  it('editar con cuerpo vacío es 400', async () => {
    const [primera] = await listar(TENANT_A);
    const r = await como(TENANT_A, `/api/v1/crm/etapas/${primera?.id}`, 'PATCH', {});
    expect(r.status).toBe(400);
  });

  it('no deja la agencia sin etapa viva (409)', async () => {
    const viva = (await listar(TENANT_B))[0];
    const r = await como(TENANT_B, `/api/v1/crm/etapas/${viva?.id}`, 'PATCH', { esPerdida: true });
    expect(r.status).toBe(409);
  });

  it('reordena de forma atómica y devuelve la lista ordenada', async () => {
    const antes = await listar(TENANT_A);
    const invertido = antes.map((e) => e.id).reverse();
    const r = await como(TENANT_A, '/api/v1/crm/etapas/reordenar', 'POST', { ids: invertido });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Etapa[]).map((e) => e.id)).toEqual(invertido);
    expect((await listar(TENANT_A)).map((e) => e.orden)).toEqual(antes.map((_, i) => i));
  });

  it('reordenar con ids de otra agencia o incompletos es 422 y no cambia nada', async () => {
    const a = await listar(TENANT_A);
    const b = await listar(TENANT_B);
    const ajeno = await como(TENANT_A, '/api/v1/crm/etapas/reordenar', 'POST', {
      ids: [...a.slice(1).map((e) => e.id), b[0]?.id],
    });
    expect(ajeno.status).toBe(422);
    const incompleto = await como(TENANT_A, '/api/v1/crm/etapas/reordenar', 'POST', {
      ids: a.slice(1).map((e) => e.id),
    });
    expect(incompleto.status).toBe(422);
    expect((await listar(TENANT_A)).map((e) => e.id)).toEqual(a.map((e) => e.id));
  });
});
