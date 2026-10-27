/**
 * Política `promo_vencida` (ADR-0017 §9, T-050) contra PostgreSQL con RLS.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`). Afirma:
 *   · GET /catalogo/ajustes responde OCULTAR en un tenant sin fila de política;
 *   · PATCH cambia la política, audita antes/después y no toca el tenant B;
 *   · el listado de gestión, las salidas y el cotizador reflejan el cambio de política;
 *   · la venta cotizada es idéntica con OCULTAR y con TACHAR (la promo vencida no cambia el precio).
 *
 * El 403 sin `catalogo.administrar` lo cubre `catalogo-ajustes.controller.spec.ts` (el atajo de
 * desarrollo concede todos los permisos).
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type {
  AjustesDeCatalogo,
  CotizacionDeSalida,
  PresentacionDePrecio,
  ResumenDePaqueteGestion,
  SalidaPublicada,
} from '@viajapro/contracts';
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
const paquetes: Record<string, string> = {};

const cabeceras = (tenantId: string) => ({
  'x-dev-tenant-id': tenantId,
  'x-dev-usuario-id': USUARIO,
  'content-type': 'application/json',
});

async function pedir(tenantId: string, metodo: string, ruta: string, cuerpo?: unknown) {
  const init: RequestInit = { method: metodo, headers: cabeceras(tenantId) };
  if (cuerpo !== undefined) init.body = JSON.stringify(cuerpo);
  return fetch(new URL(ruta, base), init);
}

async function cambiarPolitica(tenantId: string, promoVencida: 'OCULTAR' | 'TACHAR') {
  const r = await pedir(tenantId, 'PATCH', '/api/v1/catalogo/ajustes', { promoVencida });
  expect(r.status).toBe(200);
}

async function presentacionListado(tenantId: string, nombre: string) {
  const r = await pedir(tenantId, 'GET', '/api/v1/catalogo/paquetes');
  const j = (await r.json()) as { datos: ResumenDePaqueteGestion[] };
  return j.datos.find((d) => d.nombre === nombre);
}

async function crearPaquete(tenantId: string, nombre: string, publicada: boolean) {
  const paquete = await admin.paquete.create({
    data: { tenantId, nombre, destino: 'Cartagena', dias: 1, noches: 0 },
  });
  const fecha = publicada ? '2099-06-01' : null;
  const vigencia = await admin.vigencia.create({
    data: {
      tenantId,
      paqueteId: paquete.id,
      desde: new Date(fecha ?? '2019-01-01'),
      hasta: new Date(fecha ?? '2099-12-31'),
      publicada,
    },
  });
  // Promo vencida desde 2020: lista 400.000, venta 300.000.
  await admin.tarifa.create({
    data: {
      tenantId,
      vigenciaId: vigencia.id,
      nombre: 'Adulto',
      monedaIso: 'COP',
      ventaUnidades: 300000n,
      listaUnidades: 400000n,
      promoHasta: new Date('2020-01-31'),
      tipoPasajero: 'ADT',
    },
  });
  return paquete.id;
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
        slug: `fixture-aislamiento-ajustes-${letra}-${id.slice(-8)}`,
        nombre: `Agencia ${letra}`,
      },
    });
  }
  paquetes['A'] = await crearPaquete(TENANT_A, 'P Promo vencida A', false);
  await crearPaquete(TENANT_A, 'P Salida vencida A', true);
  paquetes['B'] = await crearPaquete(TENANT_B, 'P Promo vencida B', false);

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

describe('política promo_vencida', () => {
  it('GET responde OCULTAR en un tenant recién migrado', async () => {
    const r = await pedir(TENANT_A, 'GET', '/api/v1/catalogo/ajustes');
    expect(r.status).toBe(200);
    expect((await r.json()) as AjustesDeCatalogo).toEqual({ promoVencida: 'OCULTAR' });
  });

  it('PATCH rechaza valores y campos ajenos', async () => {
    expect(
      (await pedir(TENANT_A, 'PATCH', '/api/v1/catalogo/ajustes', { promoVencida: 'X' })).status,
    ).toBe(400);
    expect(
      (
        await pedir(TENANT_A, 'PATCH', '/api/v1/catalogo/ajustes', {
          promoVencida: 'TACHAR',
          tenantId: TENANT_B,
        })
      ).status,
    ).toBe(400);
  });

  it('con OCULTAR la promo vencida no muestra tachado; con TACHAR sí, y la venta es la misma', async () => {
    const cotizar = async () => {
      const r = await pedir(TENANT_A, 'POST', '/api/v1/catalogo/cotizar', {
        paqueteId: paquetes['A'],
        fecha: '2099-06-01',
        adultos: 2,
      });
      expect(r.status).toBe(200);
      return (await r.json()) as CotizacionDeSalida;
    };

    await cambiarPolitica(TENANT_A, 'OCULTAR');
    const listadoO = await presentacionListado(TENANT_A, 'P Promo vencida A');
    const cotO = await cotizar();

    await cambiarPolitica(TENANT_A, 'TACHAR');
    const listadoT = await presentacionListado(TENANT_A, 'P Promo vencida A');
    const cotT = await cotizar();

    const [pO] = listadoO?.presentacion ?? [];
    const [pT] = listadoT?.presentacion ?? [];
    expect(pO).toMatchObject({ estado: 'PROMO_VENCIDA', listaTachada: null, leyenda: null });
    expect(pT).toMatchObject({
      estado: 'PROMO_VENCIDA',
      listaTachada: { unidades: '400000', moneda: 'COP' },
      leyenda: 'PROMO_VENCIDA',
    });
    expect(pO?.venta).toEqual(pT?.venta);

    const lO = cotO.lineas[0]?.presentacion as PresentacionDePrecio;
    const lT = cotT.lineas[0]?.presentacion as PresentacionDePrecio;
    expect(lO.listaTachada).toBeNull();
    expect(lT.leyenda).toBe('PROMO_VENCIDA');
    // La venta cotizada no cambia con la política.
    expect(cotO.total).toEqual(cotT.total);
    expect(cotO.lineas[0]?.precioUnitario).toEqual(cotT.lineas[0]?.precioUnitario);
  });

  it('las salidas publicadas también reflejan la política', async () => {
    const pedirSalidas = async () => {
      const r = await pedir(TENANT_A, 'GET', '/api/v1/catalogo/salidas?desde=2099-01-01');
      return ((await r.json()) as { salidas: SalidaPublicada[] }).salidas;
    };
    await cambiarPolitica(TENANT_A, 'TACHAR');
    expect((await pedirSalidas())[0]?.presentacion?.leyenda).toBe('PROMO_VENCIDA');
    await cambiarPolitica(TENANT_A, 'OCULTAR');
    expect((await pedirSalidas())[0]?.presentacion?.listaTachada).toBeNull();
  });

  it('cambiar la política del tenant A no cambia la presentación del tenant B', async () => {
    await cambiarPolitica(TENANT_A, 'TACHAR');
    const r = await pedir(TENANT_B, 'GET', '/api/v1/catalogo/ajustes');
    expect((await r.json()) as AjustesDeCatalogo).toEqual({ promoVencida: 'OCULTAR' });
    const [pB] = (await presentacionListado(TENANT_B, 'P Promo vencida B'))?.presentacion ?? [];
    expect(pB).toMatchObject({ estado: 'PROMO_VENCIDA', listaTachada: null, leyenda: null });
  });

  it('el cambio queda auditado con antes y después, en el tenant que lo hizo', async () => {
    await cambiarPolitica(TENANT_B, 'OCULTAR');
    await cambiarPolitica(TENANT_B, 'TACHAR');
    const filas = await admin.registroAuditoria.findMany({
      where: { tenantId: TENANT_B, accion: 'catalogo.ajustes.modificado' },
      orderBy: { ocurridoEn: 'asc' },
    });
    expect(filas.length).toBe(2);
    expect(filas[1]?.detalle).toEqual({
      antes: { promoVencida: 'OCULTAR' },
      despues: { promoVencida: 'TACHAR' },
    });
    expect(filas[1]?.usuarioId).toBe(USUARIO);
    const deA = await admin.registroAuditoria.count({
      where: { tenantId: TENANT_A, accion: 'catalogo.ajustes.modificado', entidadId: TENANT_B },
    });
    expect(deA).toBe(0);
  });
});
