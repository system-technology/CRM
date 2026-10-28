/**
 * Historial de cambios de precio de una tarifa contra PostgreSQL con RLS (ADR-0017 §8, T-047), por HTTP.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`). No escribe en la agencia demo.
 *
 * Afirma:
 *   · dos cambios de venta = dos entradas (más la creación), de la más reciente a la más antigua,
 *     con usuario (solo id), instante, antes, después, moneda y origen;
 *   · paginación por cursor sin repetir ni saltar;
 *   · sin `cotizacion.ver_neto_y_margen` la entrada de neto sale sin antes ni después (llamando al
 *     controlador con permisos reducidos: el atajo de desarrollo concede todos);
 *   · aislamiento: el tenant B recibe 404 sobre la tarifa de A;
 *   · la tarifa eliminada conserva su historial, con la entrada de borrado;
 *   · el 403 sin `catalogo.administrar` lo cubre la metadata en el spec unitario.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { HistorialDePreciosController } from './interface/historial-de-precios.controller.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const USUARIO_A = randomUUID();

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;

async function llamar(tenantId: string, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': tenantId,
      'x-dev-usuario-id': USUARIO_A,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  return { estado: r.status, json: JSON.parse(texto) as Record<string, unknown> };
}

interface Entrada {
  id: string;
  campo: string;
  antes?: string | null;
  despues?: string | null;
  origen: string | null;
  moneda: string | null;
  usuarioId: string | null;
  instante: string;
}
const entradas = (json: Record<string, unknown>): Entrada[] => json['datos'] as Entrada[];

const CONDICION = {
  acomodacion: null,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
};

function comoConPermisos<T>(
  tenantId: string,
  permisos: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return ContextoTenant.ejecutarCon(
    {
      tenantId,
      usuarioId: USUARIO_A,
      identidadId: null,
      permisos: new Set(permisos as never),
      trazaId: randomUUID(),
    },
    fn,
  );
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
        slug: `fixture-aislamiento-historial-${letra}-${id.slice(-8)}`,
        nombre: `Agencia ${letra}`,
      },
    });
  }

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

describe('historial de precios de una tarifa', () => {
  let tarifaId = '';
  const ruta = () => `/api/v1/catalogo/tarifas/${tarifaId}/historial`;

  it('preparación: paquete, vigencia con tarifa y dos cambios de venta', async () => {
    const p = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/paquetes', {
      nombre: 'Isla Historial',
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
    });
    expect(p.estado).toBe(201);
    const v = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/vigencias', {
      paqueteId: String(p.json['id']),
      desde: '2026-11-01',
      hasta: '2027-06-30',
      tarifas: [
        {
          nombre: 'Adulto',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          neto: null,
          venta: { unidades: '900000', moneda: 'COP' },
          mayoristaId: null,
          aditiva: false,
          condicion: CONDICION,
        },
      ],
    });
    expect(v.estado).toBe(201);
    const t = await admin.tarifa.findFirstOrThrow({ where: { tenantId: TENANT_A } });
    tarifaId = t.id;

    for (const venta of ['950000', '990000']) {
      const r = await llamar(TENANT_A, 'PATCH', `/api/v1/catalogo/tarifas/${tarifaId}`, {
        venta: { unidades: venta, moneda: 'COP' },
      });
      expect(r.estado).toBe(200);
    }
  });

  it('lista creación y dos cambios de venta, del más reciente al más antiguo', async () => {
    const r = await llamar(TENANT_A, 'GET', ruta());
    expect(r.estado).toBe(200);
    const datos = entradas(r.json);
    expect(datos.map((d) => [d.campo, d.antes, d.despues])).toEqual([
      ['venta', '950000', '990000'],
      ['venta', '900000', '950000'],
      ['venta', null, '900000'],
    ]);
    expect(datos[0]).toMatchObject({ origen: 'PANTALLA', moneda: 'COP', usuarioId: USUARIO_A });
    expect(Number(datos[0]?.id)).toBeGreaterThan(Number(datos[1]?.id));
    expect(Object.keys(datos[0] ?? {}).sort()).toEqual(
      [
        'accion',
        'antes',
        'campo',
        'despues',
        'id',
        'instante',
        'moneda',
        'origen',
        'usuarioId',
      ].sort(),
    );
    expect(r.json['siguienteCursor']).toBeNull();
  });

  it('pagina por cursor sin repetir ni saltar', async () => {
    const p1 = await llamar(TENANT_A, 'GET', `${ruta()}?limite=2`);
    expect(entradas(p1.json)).toHaveLength(2);
    const cursor = String(p1.json['siguienteCursor']);
    expect(cursor).not.toBe('null');
    const p2 = await llamar(TENANT_A, 'GET', `${ruta()}?limite=2&cursor=${cursor}`);
    expect(entradas(p2.json).map((d) => d.despues)).toEqual(['900000']);
    expect(p2.json['siguienteCursor']).toBeNull();

    const mala = await llamar(TENANT_A, 'GET', `${ruta()}?limite=0`);
    expect(mala.estado).toBe(400);
  });

  it('el neto solo lleva valores con cotizacion.ver_neto_y_margen; sin él la clave se omite', async () => {
    const r = await llamar(TENANT_A, 'PATCH', `/api/v1/catalogo/tarifas/${tarifaId}`, {
      neto: { unidades: '700000', moneda: 'COP' },
    });
    expect(r.estado).toBe(200);

    const controlador = app.get(HistorialDePreciosController, { strict: false });
    const sin = await comoConPermisos(TENANT_A, ['catalogo.administrar'], () =>
      controlador.listar(tarifaId, { limite: 20 }),
    );
    const netoSin = sin.datos.find((d) => d.campo === 'neto');
    expect(netoSin).toBeDefined();
    expect(netoSin).not.toHaveProperty('antes');
    expect(netoSin).not.toHaveProperty('despues');
    expect(JSON.stringify(sin)).not.toContain('700000');

    const con = await comoConPermisos(
      TENANT_A,
      ['catalogo.administrar', 'cotizacion.ver_neto_y_margen'],
      () => controlador.listar(tarifaId, { limite: 20 }),
    );
    expect(con.datos.find((d) => d.campo === 'neto')).toMatchObject({
      antes: null,
      despues: '700000',
    });
  });

  it('aislamiento: el tenant B recibe 404 sobre la tarifa de A, y una inexistente también', async () => {
    const r = await llamar(TENANT_B, 'GET', ruta());
    expect(r.estado).toBe(404);
    expect(JSON.stringify(r.json)).not.toContain('990000');
    const nada = await llamar(
      TENANT_A,
      'GET',
      `/api/v1/catalogo/tarifas/${randomUUID()}/historial`,
    );
    expect(nada.estado).toBe(404);
    const noUuid = await llamar(TENANT_A, 'GET', '/api/v1/catalogo/tarifas/xyz/historial');
    expect(noUuid.estado).toBe(400);
  });

  it('una tarifa eliminada conserva su historial, con la entrada de borrado arriba', async () => {
    const d = await llamar(TENANT_A, 'DELETE', `/api/v1/catalogo/tarifas/${tarifaId}`);
    expect(d.estado).toBe(200);
    const r = await llamar(TENANT_A, 'GET', ruta());
    expect(r.estado).toBe(200);
    expect(entradas(r.json)[0]).toMatchObject({ campo: 'venta', antes: '990000', despues: null });
    expect((await llamar(TENANT_B, 'GET', ruta())).estado).toBe(404);
  });
});
