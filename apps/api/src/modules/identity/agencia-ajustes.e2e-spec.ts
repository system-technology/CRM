/**
 * `GET /api/v1/agencia/ajustes` contra PostgreSQL con RLS: dos agencias, cada una lee solo la suya
 * (zona horaria, moneda y país propios). El PATCH cambia la zona por la función SECURITY DEFINER
 * (ADR-0027) y no toca a la otra agencia. El 403 sin `usuarios.administrar` no se puede probar por
 * HTTP (el atajo de desarrollo concede todos los permisos): lo fija `agencia-ajustes.controller.spec.ts`.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AjustesDeAgencia } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const USUARIO = randomUUID();

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;

const leer = (tenantId: string) =>
  fetch(new URL('/api/v1/agencia/ajustes', base), {
    headers: { 'x-dev-tenant-id': tenantId, 'x-dev-usuario-id': USUARIO },
  });

const cambiar = (tenantId: string, cuerpo: unknown) =>
  fetch(new URL('/api/v1/agencia/ajustes', base), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': tenantId,
      'x-dev-usuario-id': USUARIO,
    },
    body: JSON.stringify(cuerpo),
  });

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  await admin.tenant.create({
    data: {
      id: TENANT_A,
      slug: `fixture-aislamiento-zona-a-${TENANT_A.slice(-8)}`,
      nombre: 'Agencia A',
    },
  });
  await admin.tenant.create({
    data: {
      id: TENANT_B,
      slug: `fixture-aislamiento-zona-b-${TENANT_B.slice(-8)}`,
      nombre: 'Agencia B',
      paisIso: 'MX',
      monedaIso: 'MXN',
      zonaHoraria: 'America/Mexico_City',
    },
  });

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(new URL(ruta, import.meta.url).href)) as {
        borrarTenants: Limpiador;
      };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('GET /api/v1/agencia/ajustes', () => {
  it('cada agencia lee solo la suya', async () => {
    const a = await leer(TENANT_A);
    expect(a.status).toBe(200);
    expect(AjustesDeAgencia.parse(await a.json())).toEqual({
      nombre: 'Agencia A',
      paisIso: 'CO',
      monedaIso: 'COP',
      zonaHoraria: 'America/Bogota',
    });
    const b = AjustesDeAgencia.parse(await (await leer(TENANT_B)).json());
    expect(b).toMatchObject({ nombre: 'Agencia B', zonaHoraria: 'America/Mexico_City' });
  });

  it('sin agencia en el contexto no responde 200', async () => {
    const r = await fetch(new URL('/api/v1/agencia/ajustes', base));
    expect(r.status).not.toBe(200);
  });
});

describe('PATCH /api/v1/agencia/ajustes', () => {
  it('cambia la zona de la agencia A y no toca a la B', async () => {
    const r = await cambiar(TENANT_A, { zonaHoraria: 'America/Lima' });
    expect(r.status).toBe(200);
    expect(AjustesDeAgencia.parse(await r.json())).toMatchObject({
      nombre: 'Agencia A',
      zonaHoraria: 'America/Lima',
    });
    const a = AjustesDeAgencia.parse(await (await leer(TENANT_A)).json());
    expect(a.zonaHoraria).toBe('America/Lima');
    const b = AjustesDeAgencia.parse(await (await leer(TENANT_B)).json());
    expect(b.zonaHoraria).toBe('America/Mexico_City');
  });

  it('zona inexistente: 422 ZONA_HORARIA_INVALIDA y la zona no cambia', async () => {
    // Estado propio: no depender del orden de las pruebas.
    expect((await cambiar(TENANT_A, { zonaHoraria: 'America/Lima' })).status).toBe(200);
    const r = await cambiar(TENANT_A, { zonaHoraria: 'Marte/Olympus_Mons' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: { code: 'ZONA_HORARIA_INVALIDA' } });
    const a = AjustesDeAgencia.parse(await (await leer(TENANT_A)).json());
    expect(a.zonaHoraria).toBe('America/Lima');
  });

  it('un alias que Intl no conoce (posix/) también es 422', async () => {
    const r = await cambiar(TENANT_A, { zonaHoraria: 'posix/America/Bogota' });
    expect(r.status).toBe(422);
  });

  it('cuerpo con campos ajenos o sin espacios válidos: 4xx y B intacta', async () => {
    const r = await cambiar(TENANT_A, { zonaHoraria: 'America/Lima', tenantId: TENANT_B });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const b = AjustesDeAgencia.parse(await (await leer(TENANT_B)).json());
    expect(b.zonaHoraria).toBe('America/Mexico_City');
  });
});
