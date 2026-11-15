/**
 * T-217 — la versión guardada conserva las edades, y volver a cotizar desde ella no da 422.
 *
 * Contra PostgreSQL con RLS, por HTTP. Fixtures propios (prefijo `fixture-aislamiento-`, el que
 * reconoce `limpiar-fixtures.mjs`): las versiones son inmutables y solo la purga de tenants las
 * borra, así que nada se escribe en la agencia demo.
 *
 * El producto tiene la forma que destapó el defecto: tarifa de adulto y tarifa de menor con edad
 * de corte (2 a 11). Antes de T-217 la versión no guardaba `edadesNinos`; la composición armada
 * desde ella llegaba sin edades y la API respondía `TARIFAS_CON_CONDICION_NO_EVALUABLE` (422).
 *
 * Afirma:
 *   · guardar con `edadesNinos: [7]` cobra Adulto x2 + Menor x1, y la lectura devuelve `[7]`;
 *   · `composicionDesdeVersion(v1)` → `POST /versiones` es 201 con el mismo total, y la v2
 *     conserva las edades;
 *   · la misma composición SIN edades sí es 422 (la prueba distingue el arreglo del defecto);
 *   · el tenant B no lee la cotización de A (404).
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { type CotizacionGuardada, composicionDesdeVersion } from '@viajapro/contracts';
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
let contactoA = '';
let paqueteA = '';

async function llamar(
  metodo: 'GET' | 'POST',
  ruta: string,
  tenant: string,
  cuerpo?: unknown,
): Promise<{ estado: number; json: CuerpoCualquiera }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-dev-tenant-id': tenant },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { estado: r.status, json: (await r.json()) as CuerpoCualquiera };
}

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
        slug: `fixture-aislamiento-edades-${letra}-${id.slice(-8)}`,
        nombre: `Agencia ${letra}`,
      },
    });
  }

  const contacto = await admin.contacto.create({
    data: {
      tenantId: TENANT_A,
      telefonoE164: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: 'Familia con un niño',
    },
  });
  contactoA = contacto.id;

  const paquete = await admin.paquete.create({
    data: {
      tenantId: TENANT_A,
      nombre: 'Puebleando fixture',
      destino: 'Quindío',
      dias: 2,
      noches: 1,
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
  await admin.tarifa.createMany({
    data: [
      {
        tenantId: TENANT_A,
        vigenciaId: vigencia.id,
        nombre: 'Adulto',
        tipoPasajero: 'ADT',
        netoUnidades: 320_000n,
        ventaUnidades: 389_000n,
        monedaIso: 'COP',
      },
      {
        tenantId: TENANT_A,
        vigenciaId: vigencia.id,
        nombre: 'Menor de 2 a 11 años',
        tipoPasajero: 'CHD',
        edadMinima: 2,
        edadMaxima: 11,
        netoUnidades: 240_000n,
        ventaUnidades: 292_000n,
        monedaIso: 'COP',
      },
    ],
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

describe('T-217: edades en la versión de cotización', () => {
  it('re-cotizar desde una versión con tarifa de menor conserva las edades y no da 422', async () => {
    const guardada = await llamar('POST', '/api/v1/cotizaciones', TENANT_A, {
      contactoId: contactoA,
      titulo: 'Familia al Quindío',
      version: { paqueteId: paqueteA, fecha: FECHA, adultos: 2, ninos: 1, edadesNinos: [7] },
    });
    expect(guardada.estado).toBe(201);
    const id = guardada.json.id ?? '';

    const leida = await llamar('GET', `/api/v1/cotizaciones/${id}`, TENANT_A);
    expect(leida.estado).toBe(200);
    const v1 = leida.json.versiones?.[0];
    if (!v1) throw new Error('la cotización no trae la versión 1');
    expect(v1.edadesNinos).toEqual([7]);
    expect(v1.edadesInfantes).toEqual([]);
    expect(v1.infantesConSilla).toBeNull();
    // 2 x 389.000 + 1 x 292.000: el niño se cobró como menor.
    expect(v1.venta).toEqual({ unidades: '1070000', moneda: 'COP' });

    // Volver a cotizar con lo que devolvió la lectura.
    const otra = await llamar(
      'POST',
      `/api/v1/cotizaciones/${id}/versiones`,
      TENANT_A,
      composicionDesdeVersion(v1),
    );
    expect(otra.estado).toBe(201);
    const v2 = otra.json.versiones?.[1];
    expect(v2?.numero).toBe(2);
    expect(v2?.venta).toEqual(v1.venta);
    expect(v2?.edadesNinos).toEqual([7]);

    // Sin edades, la misma composición es el 422 que motivó T-217.
    const { edadesNinos: _e, ...sinEdades } = composicionDesdeVersion(v1);
    const fallida = await llamar(
      'POST',
      `/api/v1/cotizaciones/${id}/versiones`,
      TENANT_A,
      sinEdades,
    );
    expect(fallida.estado).toBe(422);
    expect(fallida.json.error?.code).toBe('TARIFAS_CON_CONDICION_NO_EVALUABLE');

    // Y el tenant B no la lee.
    const ajena = await llamar('GET', `/api/v1/cotizaciones/${id}`, TENANT_B);
    expect(ajena.estado).toBe(404);
  });
});
