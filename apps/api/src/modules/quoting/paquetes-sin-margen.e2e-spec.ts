/**
 * El cotizador antiguo (Paquete / Temporada / Precio) y el detalle del paquete no entregan el
 * neto del mayorista sin `incluirMargen`: R10.
 *
 *   POST /api/v1/paquetes/cotizar        (flag en el cuerpo, como `/catalogo/cotizar`)
 *   GET  /api/v1/paquetes/:id            (flag en la consulta, como `/cotizaciones/:id`)
 *
 * Fixture propio (prefijo `fixture-aislamiento-`, el que reconoce el limpiador): no escribe en la
 * agencia demo. Se busca en el TEXTO completo de la respuesta, no en claves conocidas: un campo
 * nuevo que filtre el neto (porcentaje, base) también pondría esto en rojo.
 *
 * No implementa el permiso: la autenticación añadirá el 403 a `incluirMargen`.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const TENANT = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const PISTAS = /neto|margen|porcentaje|politica|base/i;

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let paqueteId: string;

async function llamar(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown) {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-dev-tenant-id': TENANT },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  return { estado: r.status, texto, json: JSON.parse(texto) as Record<string, unknown> };
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  await admin.tenant.create({
    data: {
      id: TENANT,
      slug: `fixture-aislamiento-pqs-${TENANT.slice(-12)}`,
      nombre: 'Agencia sin margen',
    },
  });
  const paquete = await admin.paquete.create({
    data: {
      tenantId: TENANT,
      nombre: 'Paquete antiguo fixture',
      destino: 'San Andrés',
      dias: 4,
      noches: 3,
      planAlimentacion: 'TODO_INCLUIDO',
    },
  });
  paqueteId = paquete.id;
  const temporada = await admin.temporada.create({
    data: {
      tenantId: TENANT,
      paqueteId,
      nombre: 'Temporada fixture',
      desde: new Date('2027-03-01'),
      hasta: new Date('2027-03-31'),
    },
  });
  await admin.precio.create({
    data: {
      tenantId: TENANT,
      temporadaId: temporada.id,
      acomodacion: 'DOBLE',
      tipoPasajero: 'ADT',
      netoUnidades: 1_000_000n,
      ventaUnidades: 1_200_000n,
      monedaIso: 'COP',
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
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

const cuerpoCotizar = (extra: object = {}) => ({
  paqueteId,
  fechaSalida: '2027-03-15',
  pasajeros: { adultos: 2 },
  ...extra,
});

describe('POST /api/v1/paquetes/cotizar', () => {
  it('sin incluirMargen no viaja rastro del neto, del margen ni del porcentaje', async () => {
    for (const extra of [{}, { incluirMargen: false }]) {
      const r = await llamar('POST', '/api/v1/paquetes/cotizar', cuerpoCotizar(extra));
      expect(r.estado).toBe(201);
      expect(r.texto).not.toMatch(PISTAS);
      expect((r.json['totalVenta'] as { unidades: string }).unidades).toBe('2400000');
    }
  });

  it('con incluirMargen=true sí vienen, y el precio de venta no cambia', async () => {
    const con = await llamar(
      'POST',
      '/api/v1/paquetes/cotizar',
      cuerpoCotizar({ incluirMargen: true }),
    );
    expect(con.estado).toBe(201);
    expect(con.texto).toMatch(/totalNeto/);
    expect(con.texto).toMatch(/margenPorcentaje/);
    expect(con.texto).toMatch(/subtotalNeto/);
    expect((con.json['totalNeto'] as { unidades: string }).unidades).toBe('2000000');
    expect((con.json['totalVenta'] as { unidades: string }).unidades).toBe('2400000');
  });
});

describe('GET /api/v1/paquetes/:id', () => {
  it('sin incluirMargen no viaja el neto de ningún precio', async () => {
    const r = await llamar('GET', `/api/v1/paquetes/${paqueteId}`);
    expect(r.estado).toBe(200);
    expect(r.texto).not.toMatch(PISTAS);
    expect(r.texto).toMatch(/ventaUnidades|venta/);
  });

  it('con incluirMargen=true el neto sí viene', async () => {
    const r = await llamar('GET', `/api/v1/paquetes/${paqueteId}?incluirMargen=true`);
    expect(r.estado).toBe(200);
    expect(r.texto).toMatch(/"neto":\{"unidades":"1000000"/);
  });
});
