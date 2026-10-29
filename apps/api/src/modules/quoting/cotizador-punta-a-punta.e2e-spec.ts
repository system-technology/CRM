/**
 * Cotizador punta a punta (T-011): HTTP → caso de uso → PostgreSQL con RLS, contra Neon.
 *
 * Todo el tarifario se crea **por la API**, como lo haría la pantalla de gestión, y se cotiza con
 * la ruta vigente `POST /api/v1/catalogo/cotizar`; después se guarda con `POST /api/v1/cotizaciones`
 * y se relee. Ningún atajo de base de datos para el camino feliz: solo para crear la agencia y el
 * contacto de fixture.
 *
 * Los dos casos canónicos del cotizador (mismo tarifario que `seed.ts`, temporada alta diciembre):
 *   · 2 adultos + 2 niños en doble el 24 de diciembre: 2 × 2.690.000 + 2 × 1.860.000 =
 *     $9.100.000 COP; neto 7.280.000; margen 1.820.000 = 20 % de la venta.
 *   · 3 adultos en doble: la promo de pareja no aplica y el motivo lo dice («sobra 1»). Es la
 *     cara del tarifario del mismo hecho que la pantalla anuncia como «1 plaza sin usar, se paga
 *     igual» (las habitaciones las reparte la web; la API no reparte camas).
 *
 * Fixtures propios con el prefijo `fixture-aislamiento-` y limpieza con el limpiador compartido.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { CotizacionDeSalida, CotizacionGuardada } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT = idDeTenant();
const USUARIO = randomUUID();
const FECHA_DICIEMBRE = '2027-12-24';

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let paqueteId = '';
let contactoId = '';

async function llamar<T>(
  metodo: 'GET' | 'POST',
  ruta: string,
  cuerpo?: unknown,
): Promise<{ estado: number; json: T }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': TENANT,
      'x-dev-usuario-id': USUARIO,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { estado: r.status, json: (await r.json()) as T };
}

const condicion = (extra: Record<string, unknown> = {}) => ({
  acomodacion: 'DOBLE',
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
  ...extra,
});

const cop = (unidades: string) => ({ unidades, moneda: 'COP' });

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  await admin.tenant.create({
    data: {
      id: TENANT,
      slug: `fixture-aislamiento-cotizador-${TENANT.slice(-12)}`,
      nombre: 'Agencia cotizador punta a punta',
    },
  });
  contactoId = (
    await admin.contacto.create({
      data: {
        tenantId: TENANT,
        telefonoE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
        nombre: 'Familia Pérez',
      },
    })
  ).id;

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();

  // El tarifario, por la API: paquete + vigencia de temporada alta con sus tres tarifas.
  const paquete = await llamar<{ id: string }>('POST', '/api/v1/catalogo/paquetes', {
    nombre: 'San Andrés — 4 días / 3 noches, todo incluido',
    destino: 'San Andrés',
    dias: 4,
    noches: 3,
  });
  expect(paquete.estado).toBe(201);
  paqueteId = paquete.json.id;

  const vigencia = await llamar('POST', '/api/v1/catalogo/vigencias', {
    paqueteId,
    desde: '2027-12-15',
    hasta: '2028-01-15',
    tarifas: [
      {
        nombre: 'Adulto en doble',
        unidad: 'POR_PERSONA',
        neto: cop('2150000'),
        venta: cop('2690000'),
        condicion: condicion({ tipoPasajero: 'ADT' }),
      },
      {
        nombre: 'Menor en doble',
        unidad: 'POR_PERSONA',
        neto: cop('1490000'),
        venta: cop('1860000'),
        condicion: condicion({ tipoPasajero: 'CHD' }),
      },
      {
        nombre: 'Promo pareja',
        unidad: 'POR_GRUPO',
        cubrePasajeros: 2,
        neto: cop('3800000'),
        venta: cop('4750000'),
        condicion: condicion(),
      },
    ],
  });
  expect(vigencia.estado).toBe(201);
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
      await modulo.borrarTenants(adminPg, [TENANT]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('cotizador punta a punta (T-011)', () => {
  it('2 adultos + 2 niños en diciembre, doble: $9.100.000 COP con margen del 20 %', async () => {
    const r = await llamar<CotizacionDeSalida>('POST', '/api/v1/catalogo/cotizar', {
      paqueteId,
      fecha: FECHA_DICIEMBRE,
      adultos: 2,
      ninos: 2,
      acomodacion: 'DOBLE',
      incluirMargen: true,
    });
    expect(r.estado).toBe(200);
    const c = r.json;

    expect(c.vigenciaDesde).toBe('2027-12-15');
    expect(c.vigenciaHasta).toBe('2028-01-15');
    expect(c.pasajeros).toBe(4);
    expect(c.pideComposicion).toBe(true);

    const porNombre = new Map(c.lineas.map((l) => [l.nombre, l]));
    expect(c.lineas).toHaveLength(2);
    expect(porNombre.get('Adulto en doble')).toMatchObject({
      veces: 2,
      precioUnitario: cop('2690000'),
      total: cop('5380000'),
      margen: cop('1080000'),
    });
    expect(porNombre.get('Menor en doble')).toMatchObject({
      veces: 2,
      precioUnitario: cop('1860000'),
      total: cop('3720000'),
      margen: cop('740000'),
    });
    expect(c.total).toEqual(cop('9100000'));

    // Margen total sobre la venta, en enteros (R8): 1.820.000 / 9.100.000 = 20 %.
    const margen = c.lineas.reduce((s, l) => s + BigInt(l.margen?.unidades ?? '0'), 0n);
    expect(margen).toBe(1_820_000n);
    expect((margen * 100n) / BigInt(c.total.unidades)).toBe(20n);

    // La promo de pareja cuadra con 4 (dos parejas) y se ofrece como alternativa, no se aplica sola.
    expect(c.alternativas.map((a) => a.nombre)).toContain('Promo pareja');
  });

  it('sin incluirMargen la misma cotización no revela margen ni neto', async () => {
    const r = await llamar<CotizacionDeSalida>('POST', '/api/v1/catalogo/cotizar', {
      paqueteId,
      fecha: FECHA_DICIEMBRE,
      adultos: 2,
      ninos: 2,
      acomodacion: 'DOBLE',
    });
    expect(r.estado).toBe(200);
    expect(r.json.total).toEqual(cop('9100000'));
    expect(JSON.stringify(r.json)).not.toMatch(/margen|neto/i);
  });

  it('guardar la cotización persiste la versión 1 recalculada: venta, neto y margen', async () => {
    const r = await llamar<CotizacionGuardada>('POST', '/api/v1/cotizaciones?incluirMargen=true', {
      contactoId,
      titulo: 'San Andrés diciembre — familia',
      version: {
        paqueteId,
        fecha: FECHA_DICIEMBRE,
        adultos: 2,
        ninos: 2,
        acomodacion: 'DOBLE',
      },
    });
    expect(r.estado).toBe(201);
    const id = r.json.id;

    const leida = await llamar<CotizacionGuardada>(
      'GET',
      `/api/v1/cotizaciones/${id}?incluirMargen=true`,
    );
    expect(leida.estado).toBe(200);
    const v1 = leida.json.versiones[0]!;
    expect(v1.numero).toBe(1);
    expect(v1.acomodacion).toBe('DOBLE');
    expect(v1).toMatchObject({ adultos: 2, ninos: 2, infantes: 0, fechaSalida: FECHA_DICIEMBRE });
    expect(v1.venta).toEqual(cop('9100000'));
    expect(v1.neto).toEqual(cop('7280000'));
    expect(v1.margen).toEqual(cop('1820000'));

    // Y quedó en la base, con el tenant correcto (R1).
    const filas = await admin.cotizacion.count({ where: { tenantId: TENANT, id } });
    expect(filas).toBe(1);
  });

  it('3 adultos en doble: la promo de pareja no aplica y el motivo dice que sobra 1', async () => {
    const r = await llamar<CotizacionDeSalida>('POST', '/api/v1/catalogo/cotizar', {
      paqueteId,
      fecha: FECHA_DICIEMBRE,
      adultos: 3,
      acomodacion: 'DOBLE',
    });
    expect(r.estado).toBe(200);
    const c = r.json;

    expect(c.lineas).toHaveLength(1);
    expect(c.lineas[0]).toMatchObject({ nombre: 'Adulto en doble', veces: 3 });
    expect(c.total).toEqual(cop('8070000'));

    expect(c.alternativas.map((a) => a.nombre)).not.toContain('Promo pareja');
    const promo = c.noAplicables.find((n) => n.nombre === 'Promo pareja');
    expect(promo?.motivo).toBe('Aplica a grupos de 2; sobra 1');
  });
});
