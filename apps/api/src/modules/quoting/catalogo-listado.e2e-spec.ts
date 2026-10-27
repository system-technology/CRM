/**
 * `GET /api/v1/catalogo/paquetes` (listado de gestión, ADR-0017 §4.1) contra PostgreSQL con RLS.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`, el que reconoce el limpiador).
 * No escribe en la agencia demo.
 *
 * Afirma:
 *   · «desde» con infante a 0 y con suplemento aditivo = la tarifa base del adulto, nunca 0;
 *   · COP y USD juntos: una entrada por moneda, sin conversión;
 *   · sin tarifas base (o sin vigencias vigentes), «desde» es `[]`;
 *   · `?incluirInactivos=true` incluye los desactivados y por defecto no salen;
 *   · paginación por cursor sin repetir ni saltar;
 *   · el tenant B no ve los paquetes del A;
 *   · `GET /catalogo/salidas` usa el mismo cálculo (no anuncia el infante a 0).
 *
 * El 403 sin `catalogo.administrar` lo cubre `catalogo-listado.controller.spec.ts` (el atajo de
 * desarrollo concede todos los permisos).
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { ResumenDePaqueteGestion } from '@viajapro/contracts';
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

interface Pagina {
  datos: ResumenDePaqueteGestion[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

async function listar(tenantId: string, consulta = ''): Promise<Pagina> {
  const r = await fetch(new URL(`/api/v1/catalogo/paquetes${consulta}`, base), {
    headers: { 'x-dev-tenant-id': tenantId, 'x-dev-usuario-id': USUARIO },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Pagina;
}

interface TarifaDeFixture {
  nombre: string;
  ventaUnidades: bigint;
  monedaIso?: string;
  tipoPasajero?: 'ADT' | 'CHD' | 'INF';
  edadMaxima?: number;
  ocupaSilla?: boolean;
  aditiva?: boolean;
}

async function crearPaquete(
  tenantId: string,
  nombre: string,
  opciones: {
    activo?: boolean;
    hasta?: string;
    publicada?: boolean;
    tarifas: TarifaDeFixture[];
  },
): Promise<string> {
  const paquete = await admin.paquete.create({
    data: {
      tenantId,
      nombre,
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
      activo: opciones.activo ?? true,
    },
  });
  const desde = opciones.publicada ? '2099-06-01' : '2099-01-01';
  const hasta = opciones.publicada ? '2099-06-01' : (opciones.hasta ?? '2099-12-31');
  const vigencia = await admin.vigencia.create({
    data: {
      tenantId,
      paqueteId: paquete.id,
      desde: new Date(desde),
      hasta: new Date(hasta),
      publicada: opciones.publicada ?? false,
    },
  });
  for (const t of opciones.tarifas) {
    await admin.tarifa.create({
      data: { tenantId, vigenciaId: vigencia.id, monedaIso: 'COP', ...t },
    });
  }
  return paquete.id;
}

const porNombre = (p: Pagina, nombre: string) => p.datos.find((d) => d.nombre === nombre);

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  for (const [id, letra] of [
    [TENANT_A, 'a'],
    [TENANT_B, 'b'],
  ] as const) {
    await admin.tenant.create({
      data: {
        id,
        slug: `fixture-aislamiento-listado-${letra}-${id.slice(-8)}`,
        nombre: `Agencia ${letra}`,
      },
    });
  }

  await crearPaquete(TENANT_A, 'L Infante y suplemento', {
    tarifas: [
      { nombre: 'Adulto', ventaUnidades: 900000n, tipoPasajero: 'ADT' },
      {
        nombre: 'Infante',
        ventaUnidades: 0n,
        tipoPasajero: 'INF',
        edadMaxima: 2,
        ocupaSilla: false,
      },
      { nombre: 'Suplemento sencilla', ventaUnidades: 150000n, aditiva: true },
    ],
  });
  await crearPaquete(TENANT_A, 'L Dos monedas', {
    tarifas: [
      { nombre: 'Adulto COP', ventaUnidades: 900000n },
      { nombre: 'Adulto USD', ventaUnidades: 25000n, monedaIso: 'USD' },
    ],
  });
  await crearPaquete(TENANT_A, 'L Sin base', {
    tarifas: [{ nombre: 'Suplemento', ventaUnidades: 100n, aditiva: true }],
  });
  await crearPaquete(TENANT_A, 'L Vencido', {
    hasta: '2020-01-31',
    tarifas: [{ nombre: 'Adulto', ventaUnidades: 1000n }],
  });
  await crearPaquete(TENANT_A, 'L Desactivado', {
    activo: false,
    tarifas: [{ nombre: 'Adulto', ventaUnidades: 777000n }],
  });
  await crearPaquete(TENANT_A, 'L Salida publicada', {
    publicada: true,
    tarifas: [
      { nombre: 'Adulto', ventaUnidades: 389000n, tipoPasajero: 'ADT' },
      { nombre: 'Infante', ventaUnidades: 0n, tipoPasajero: 'INF', ocupaSilla: false },
    ],
  });
  await crearPaquete(TENANT_B, 'L Del tenant B', {
    tarifas: [{ nombre: 'Adulto', ventaUnidades: 1n }],
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
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('GET /api/v1/catalogo/paquetes', () => {
  it('«desde» con infante a 0 y suplemento aditivo es la tarifa base del adulto, nunca 0', async () => {
    const p = porNombre(await listar(TENANT_A), 'L Infante y suplemento');
    expect(p?.desde).toEqual([{ unidades: '900000', moneda: 'COP' }]);
    expect(p?.desdeEsDeGrupo).toBe(false);
    expect(p?.vigenciasActivas).toBe(1);
  });

  it('COP y USD juntos: una entrada por moneda, sin conversión', async () => {
    const p = porNombre(await listar(TENANT_A), 'L Dos monedas');
    expect(p?.desde).toEqual([
      { unidades: '900000', moneda: 'COP' },
      { unidades: '25000', moneda: 'USD' },
    ]);
  });

  it('sin tarifas base, o con la vigencia vencida, «desde» es []', async () => {
    const pagina = await listar(TENANT_A);
    expect(porNombre(pagina, 'L Sin base')?.desde).toEqual([]);
    const vencido = porNombre(pagina, 'L Vencido');
    expect(vencido?.desde).toEqual([]);
    expect(vencido?.vigenciasActivas).toBe(0);
  });

  it('el neto no viaja en el listado', async () => {
    const pagina = await listar(TENANT_A);
    expect(JSON.stringify(pagina)).not.toMatch(/neto/i);
  });

  it('por defecto no incluye desactivados; con incluirInactivos=true sí', async () => {
    expect(porNombre(await listar(TENANT_A), 'L Desactivado')).toBeUndefined();
    const con = porNombre(await listar(TENANT_A, '?incluirInactivos=true'), 'L Desactivado');
    expect(con).toMatchObject({ activo: false, desde: [{ unidades: '777000', moneda: 'COP' }] });
  });

  it('pagina por cursor sin repetir ni saltar', async () => {
    const todos = await listar(TENANT_A, '?incluirInactivos=true&limite=100');
    expect(todos.pageInfo).toEqual({ nextCursor: null, hasMore: false });

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const consulta: string = `?incluirInactivos=true&limite=2${cursor ? `&cursor=${cursor}` : ''}`;
      const p: Pagina = await listar(TENANT_A, consulta);
      expect(p.datos.length).toBeLessThanOrEqual(2);
      vistos.push(...p.datos.map((d) => d.id));
      if (!p.pageInfo.hasMore) break;
      cursor = p.pageInfo.nextCursor;
      expect(cursor).not.toBeNull();
    }
    expect(vistos).toEqual(todos.datos.map((d) => d.id));
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it('el tenant B no ve los paquetes del A, ni el A los del B', async () => {
    const deB = await listar(TENANT_B, '?incluirInactivos=true');
    expect(deB.datos.map((d) => d.nombre)).toEqual(['L Del tenant B']);
    const deA = await listar(TENANT_A, '?incluirInactivos=true&limite=100');
    expect(deA.datos.map((d) => d.nombre)).not.toContain('L Del tenant B');
  });

  it('un límite fuera de rango es 400', async () => {
    const r = await fetch(new URL('/api/v1/catalogo/paquetes?limite=1000', base), {
      headers: { 'x-dev-tenant-id': TENANT_A, 'x-dev-usuario-id': USUARIO },
    });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/v1/catalogo/salidas usa el mismo «desde»', () => {
  it('anuncia la tarifa del adulto y no el infante a 0', async () => {
    const r = await fetch(new URL('/api/v1/catalogo/salidas?desde=2099-01-01', base), {
      headers: { 'x-dev-tenant-id': TENANT_A, 'x-dev-usuario-id': USUARIO },
    });
    expect(r.status).toBe(200);
    const { salidas } = (await r.json()) as {
      salidas: Array<{ paqueteNombre: string; desde: { unidades: string }; tarifas: number }>;
    };
    const s = salidas.find((x) => x.paqueteNombre === 'L Salida publicada');
    expect(s?.desde.unidades).toBe('389000');
    expect(s?.tarifas).toBe(1);
  });
});
