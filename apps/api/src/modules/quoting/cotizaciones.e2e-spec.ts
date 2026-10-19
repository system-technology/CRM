/**
 * Cotizaciones guardadas, a través de HTTP y contra Neon.
 *
 *   POST /api/v1/cotizaciones                  guardar (cabecera + versión 1)
 *   POST /api/v1/cotizaciones/:id/versiones    añadir la versión siguiente
 *   GET  /api/v1/cotizaciones/:id              leer con todas sus versiones
 *
 * **Fixtures propios.** Las versiones son inmutables y solo la purga de tenants las borra, así
 * que esta prueba NO escribe en la agencia demo: crea dos agencias de fixture (prefijo
 * `fixture-aislamiento-`, el que reconoce `limpiar-fixtures.mjs`) con su paquete, vigencia,
 * tarifa y contacto, y las borra al terminar con el mismo limpiador del paquete de base de datos.
 *
 * Lo que afirma:
 *   · guardar crea la cabecera y la versión 1, y el SERVIDOR recalcula (nada de importes del
 *     cliente: un cuerpo con `total` se rechaza);
 *   · una versión es una instantánea: al subir la tarifa, la versión 1 no cambia y la 2 sí;
 *   · el margen y el neto solo salen con `incluirMargen=true`;
 *   · la base rechaza editar una versión (disparador de inmutabilidad);
 *   · un tenant no lee la cotización de otro (404), ni añade versiones a ella;
 *   · un contacto de otra agencia no se puede cotizar.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { CotizacionGuardada } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

interface CuerpoCualquiera extends Partial<CotizacionGuardada> {
  error?: { code: string };
}

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const FECHA = '2027-03-15';

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let contactoA: string;
let contactoB: string;
let paqueteA: string;
let tarifaA: string;

const cabeceras = (tenant: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-dev-tenant-id': tenant,
});

async function llamar(
  metodo: 'GET' | 'POST',
  ruta: string,
  tenant: string,
  cuerpo?: unknown,
): Promise<{ estado: number; json: CuerpoCualquiera }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: cabeceras(tenant),
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { estado: r.status, json: (await r.json()) as CuerpoCualquiera };
}

async function crearAgencia(tenant: string, sufijo: string) {
  await admin.tenant.create({
    data: {
      id: tenant,
      slug: `fixture-aislamiento-cot-${tenant.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
    },
  });
  const contacto = await admin.contacto.create({
    data: {
      tenantId: tenant,
      telefonoE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: 'Viajero',
    },
  });
  return contacto.id;
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  contactoA = await crearAgencia(TENANT_A, 'A');
  contactoB = await crearAgencia(TENANT_B, 'B');

  const paquete = await admin.paquete.create({
    data: {
      tenantId: TENANT_A,
      nombre: 'San Andrés fixture',
      destino: 'San Andrés',
      dias: 4,
      noches: 3,
      planAlimentacion: 'TODO_INCLUIDO',
    },
  });
  paqueteA = paquete.id;
  const vigencia = await admin.vigencia.create({
    data: {
      tenantId: TENANT_A,
      paqueteId: paqueteA,
      desde: new Date('2027-03-01'),
      hasta: new Date('2027-03-31'),
    },
  });
  const tarifa = await admin.tarifa.create({
    data: {
      tenantId: TENANT_A,
      vigenciaId: vigencia.id,
      nombre: 'Adulto',
      netoUnidades: 1_000_000n,
      ventaUnidades: 1_200_000n,
      monedaIso: 'COP',
    },
  });
  tarifaA = tarifa.id;

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
      // Especificador no literal: el limpiador es JS sin tipos y se comparte con el paquete de base de datos.
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

const composicion = (adultos = 2) => ({ paqueteId: paqueteA, fecha: FECHA, adultos });

describe('cotizaciones guardadas', () => {
  let guardada: CotizacionGuardada;

  it('guardar crea la cabecera y la versión 1, recalculada por el servidor', async () => {
    const r = await llamar('POST', '/api/v1/cotizaciones', TENANT_A, {
      contactoId: contactoA,
      titulo: 'San Andrés para dos',
      version: composicion(2),
    });
    expect(r.estado).toBe(201);
    guardada = r.json as CotizacionGuardada;

    expect(guardada.estado).toBe('BORRADOR');
    expect(guardada.versiones).toHaveLength(1);
    const v1 = guardada.versiones[0]!;
    expect(v1.numero).toBe(1);
    expect(v1.venta).toEqual({ unidades: '2400000', moneda: 'COP' });
    expect(v1.paqueteNombre).toBe('San Andrés fixture');
    expect(v1.politica.base).toBe('SOBRE_EL_NETO');
    expect(v1.lineas).toHaveLength(1);
    // Sin `incluirMargen`: ni margen, ni neto, ni la clave.
    expect(Object.keys(v1)).not.toContain('neto');
    expect(Object.keys(v1)).not.toContain('margen');
    expect(Object.keys(v1.lineas[0]!)).not.toContain('margen');
  });

  it('rechaza un cuerpo con importes: el cliente no fija el precio', async () => {
    const r = await llamar('POST', '/api/v1/cotizaciones', TENANT_A, {
      contactoId: contactoA,
      titulo: 'Con trampa',
      version: { ...composicion(2), total: { unidades: '1', moneda: 'COP' } },
    });
    expect(r.estado).toBe(400);
  });

  it('leer devuelve lo mismo, y el margen solo con incluirMargen=true', async () => {
    const sin = await llamar('GET', `/api/v1/cotizaciones/${guardada.id}`, TENANT_A);
    expect(sin.estado).toBe(200);
    expect(Object.keys(sin.json.versiones![0]!)).not.toContain('neto');

    const con = await llamar(
      'GET',
      `/api/v1/cotizaciones/${guardada.id}?incluirMargen=true`,
      TENANT_A,
    );
    expect(con.json.versiones![0]!.neto).toEqual({ unidades: '2000000', moneda: 'COP' });
    expect(con.json.versiones![0]!.margen).toEqual({ unidades: '400000', moneda: 'COP' });
  });

  it('la versión 1 NO cambia al subir la tarifa y crear la versión 2', async () => {
    const antes = await llamar(
      'GET',
      `/api/v1/cotizaciones/${guardada.id}?incluirMargen=true`,
      TENANT_A,
    );

    await admin.tarifa.update({
      where: { id: tarifaA },
      data: { netoUnidades: 1_100_000n, ventaUnidades: 1_500_000n },
    });
    const r = await llamar(
      'POST',
      `/api/v1/cotizaciones/${guardada.id}/versiones?incluirMargen=true`,
      TENANT_A,
      composicion(3),
    );
    expect(r.estado).toBe(201);
    const c = r.json as CotizacionGuardada;
    expect(c.versiones.map((v) => v.numero)).toEqual([1, 2]);
    expect(c.versiones[1]!.venta).toEqual({ unidades: '4500000', moneda: 'COP' });
    expect(c.versiones[1]!.adultos).toBe(3);

    // La 1, idéntica byte a byte a como estaba antes de tocar el tarifario.
    expect(c.versiones[0]).toEqual(antes.json.versiones![0]!);
    expect(c.versiones[0]!.venta).toEqual({ unidades: '2400000', moneda: 'COP' });
  });

  it('la base rechaza editar una versión ya guardada', async () => {
    await expect(
      admin.$executeRaw`UPDATE versiones_cotizacion SET adultos = 9 WHERE cotizacion_id = ${guardada.id}::uuid`,
    ).rejects.toThrow(/inmutable/);
  });

  it('otro tenant no la lee, ni le añade versiones (404)', async () => {
    const leer = await llamar('GET', `/api/v1/cotizaciones/${guardada.id}`, TENANT_B);
    expect(leer.estado).toBe(404);
    expect(leer.json.error?.code).toBe('COTIZACION_NO_ENCONTRADO');

    const anadir = await llamar(
      'POST',
      `/api/v1/cotizaciones/${guardada.id}/versiones`,
      TENANT_B,
      composicion(1),
    );
    expect(anadir.estado).toBe(404);
  });

  it('no se puede cotizar para el contacto de otra agencia', async () => {
    const r = await llamar('POST', '/api/v1/cotizaciones', TENANT_A, {
      contactoId: contactoB,
      titulo: 'Contacto ajeno',
      version: composicion(1),
    });
    expect(r.estado).toBe(404);
    expect(r.json.error?.code).toBe('CONTACTO_DE_COTIZACION_NO_ENCONTRADO');
  });

  it('un contacto inexistente o una oportunidad ajena al contacto se rechazan', async () => {
    const r = await llamar('POST', '/api/v1/cotizaciones', TENANT_A, {
      contactoId: contactoA,
      oportunidadId: randomUUID(),
      titulo: 'Oportunidad inventada',
      version: composicion(1),
    });
    expect(r.estado).toBe(404);
    expect(r.json.error?.code).toBe('OPORTUNIDAD_DE_COTIZACION_NO_ENCONTRADO');
  });

  it('una fecha sin vigencia no guarda nada', async () => {
    const r = await llamar('POST', '/api/v1/cotizaciones', TENANT_A, {
      contactoId: contactoA,
      titulo: 'Fuera de vigencia',
      version: { ...composicion(2), fecha: '2030-01-01' },
    });
    expect(r.estado).toBe(409);
    const filas = await admin.cotizacion.count({ where: { tenantId: TENANT_A } });
    expect(filas).toBe(1);
  });
});
