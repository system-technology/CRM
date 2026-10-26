/**
 * Prueba con base de datos del núcleo de `semilla-agencia-desde-json`: idempotencia y aislamiento.
 *
 * JSON SINTÉTICO e inventado (ver `semilla-agencia-desde-json.spec.ts`). Los tenants llevan el
 * prefijo `fixture-aislamiento-` (contrato con `scripts/limpiar-fixtures.mjs`), así que el
 * residuo de una corrida interrumpida lo barre `fixtures:limpiar`.
 *
 * Se conecta con `viajapro_app` para el negocio —el mismo rol que usará el script— y con el
 * propietario solo para `tenants`/`identidades` y para la limpieza.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { sembrarAgenciaDesdeCatalogo } from '../prisma/semilla-agencia-nucleo.js';
// @ts-expect-error — módulo JS sin tipos, compartido con `scripts/limpiar-fixtures.mjs`.
import { borrarTenants } from '../scripts/borrar-tenants.mjs';

const URL_APP = process.env['DATABASE_APP_URL'] ?? '';
const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
if (!URL_APP) throw new Error('Falta DATABASE_APP_URL: esta prueba no cae al rol propietario.');
if (!URL_ADMIN) throw new Error('Falta DATABASE_URL (rol propietario, para la limpieza).');

const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10);

const catalogo = (nombreAgencia: string, tours: unknown[]) => ({
  agencia: { nombre: nombreAgencia, pais: 'CO', moneda: 'COP' },
  tours,
});

const TOURS_A = [
  {
    nombre: 'Excursión Ñandú Clásica',
    precio_lista_cop: 300000,
    precio_promo_cop: 250000,
    es_desde: false,
    sin_precio: false,
    hora_salida: '4:00 AM',
    incluye: ['Guía'],
    no_incluye: ['Entrada al museo'],
  },
  {
    nombre: 'Isla Falsa',
    precio_lista_cop: 500000,
    precio_promo_cop: null,
    es_desde: true,
    sin_precio: false,
    opciones_de_salida: [
      { etiqueta: 'Lancha', hora_salida: '5:00 AM', hora_regreso: '3:00 PM' },
      { etiqueta: 'Terrestre', hora_salida: '4:30 AM - 5:00 AM (según zona)' },
    ],
    no_incluye: ['Impuesto de muelle'],
    restricciones: ['Plan exclusivo para mayores de 12 años'],
    cargos_en_destino: [{ concepto: 'Tasa portuaria', monto_cop: 29000, por: 'persona' }],
  },
  {
    nombre: 'Club Sin Precio',
    precio_lista_cop: null,
    precio_promo_cop: null,
    es_desde: false,
    sin_precio: true,
  },
];

// Mismo nombre de tour que en A: el código es único POR AGENCIA, no global.
const TOURS_B = [{ ...TOURS_A[0], nombre: 'Excursión Ñandú Clásica' }];

const NOMBRE_A = `Fixture Aislamiento ${MARCA} Semilla A`;
const NOMBRE_B = `Fixture Aislamiento ${MARCA} Semilla B`;
const CORREO_A = `fixture-aislamiento-${MARCA}-a@agenciademo.test`;
const CORREO_B = `fixture-aislamiento-${MARCA}-b@agenciademo.test`;

let plataforma: PrismaClient;
let app: PrismaClient;
let admin: Client;
const tenants: string[] = [];

const comoTenant = <T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> =>
  app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}::text, true)`;
    return fn(tx as unknown as PrismaClient);
  });

beforeAll(async () => {
  plataforma = new PrismaClient({ datasources: { db: { url: URL_ADMIN } } });
  app = new PrismaClient({ datasources: { db: { url: URL_APP } } });
  admin = new Client({ connectionString: URL_ADMIN });
  await admin.connect();
});

afterAll(async () => {
  await admin.query('BEGIN');
  await borrarTenants(admin, tenants);
  await admin.query('DELETE FROM identidades WHERE correo::text = ANY($1)', [[CORREO_A, CORREO_B]]);
  await admin.query('COMMIT');
  await admin.end();
  await plataforma.$disconnect();
  await app.$disconnect();
});

describe('semilla de agencia desde JSON', () => {
  let tenantA = '';
  let tenantB = '';

  it('siembra la agencia completa con viajapro_app bajo RLS', async () => {
    const r = await sembrarAgenciaDesdeCatalogo({
      plataforma,
      app,
      datos: catalogo(NOMBRE_A, TOURS_A),
      correoDelDueno: CORREO_A,
    });
    tenantA = r.tenantId;
    tenants.push(tenantA);
    expect(r).toMatchObject({
      paquetes: 3,
      vigencias: 2,
      tarifas: 2,
      opcionesDeSalida: 2,
      sinPrecio: 1,
    });

    await comoTenant(tenantA, async (tx) => {
      const roles = await tx.rol.findMany({ where: { tenantId: tenantA } });
      expect(roles.find((x) => x.clave === 'DUENO')?.permisos).toContain('catalogo.administrar');
      expect(await tx.politicaDePrecio.count({ where: { tenantId: tenantA } })).toBe(1);
      expect(await tx.usuario.count({ where: { tenantId: tenantA, correo: CORREO_A } })).toBe(1);

      const isla = await tx.paquete.findFirstOrThrow({
        where: { tenantId: tenantA, codigo: 'isla-falsa' },
        include: { formato: true },
      });
      expect(isla.formato?.nombre).toBe('Excursión de un día');
      expect([isla.dias, isla.noches, isla.planAlimentacion]).toEqual([1, 0, null]);
      expect(isla.cargosEnDestino).toEqual([
        {
          concepto: 'Tasa portuaria',
          monto: { unidades: '29000', moneda: 'COP' },
          unidad: 'POR_PERSONA',
        },
        {
          concepto: 'Impuesto de muelle',
          monto: null,
          unidad: 'POR_PERSONA',
          nota: 'Monto no publicado por la agencia',
        },
      ]);

      const promo = await tx.tarifa.findFirstOrThrow({
        where: { tenantId: tenantA, listaUnidades: { not: null } },
      });
      expect([promo.listaUnidades, promo.ventaUnidades, promo.promoHasta]).toEqual([
        300000n,
        250000n,
        null,
      ]);
      const sinPrecio = await tx.paquete.findFirstOrThrow({
        where: { tenantId: tenantA, codigo: 'club-sin-precio' },
        include: { vigencias: true },
      });
      expect(sinPrecio.vigencias).toHaveLength(0);
    });
  });

  it('es idempotente: correrla otra vez deja el mismo estado', async () => {
    const r = await sembrarAgenciaDesdeCatalogo({
      plataforma,
      app,
      datos: catalogo(NOMBRE_A, TOURS_A),
      correoDelDueno: CORREO_A,
    });
    expect(r.tenantId).toBe(tenantA);
    expect(r).toMatchObject({
      paquetes: 3,
      vigencias: 2,
      tarifas: 2,
      opcionesDeSalida: 2,
      sinPrecio: 1,
    });
  });

  it('aislamiento (R1): otra agencia no ve los paquetes y el mismo código convive', async () => {
    const r = await sembrarAgenciaDesdeCatalogo({
      plataforma,
      app,
      datos: catalogo(NOMBRE_B, TOURS_B),
      correoDelDueno: CORREO_B,
    });
    tenantB = r.tenantId;
    tenants.push(tenantB);
    expect(tenantB).not.toBe(tenantA);
    expect(r.paquetes).toBe(1);

    await comoTenant(tenantB, async (tx) => {
      expect(await tx.paquete.count({ where: { codigo: 'isla-falsa' } })).toBe(0);
      expect(await tx.paquete.count()).toBe(1);
      expect(await tx.tarifa.count()).toBe(1);
      expect(await tx.opcionDeSalida.count()).toBe(0);
    });
    await comoTenant(tenantA, async (tx) => {
      expect(await tx.paquete.count()).toBe(3);
    });
    // Sin contexto de tenant, RLS no devuelve ninguna fila.
    expect(await app.paquete.count({ where: { codigo: 'isla-falsa' } })).toBe(0);
  });
});
