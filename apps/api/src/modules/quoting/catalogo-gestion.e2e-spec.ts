/**
 * Gestión del catálogo contra PostgreSQL con RLS (ADR-0017 §1, §4.1 y §8), por HTTP y por el
 * aplicador.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`, el que reconoce el limpiador).
 * No escribe en la agencia demo.
 *
 * Afirma:
 *   · POST /api/v1/catalogo/paquetes crea (201) y el paquete aparece en GET /api/v1/paquetes;
 *   · un cuerpo con `tenantId` es 400;
 *   · aplicar una propuesta crea el catálogo y la auditoría; repetirla no cambia nada (idempotente);
 *   · un error a mitad de la aplicación no deja nada a medias (catálogo ni auditoría);
 *   · un cambio de precio audita `venta` con el valor anterior y el nuevo, sin datos personales;
 *   · otro tenant no ve el paquete, recibe 404 al editarlo o desactivarlo, y no ve la auditoría.
 *
 * El 403 sin `catalogo.administrar` lo cubre `catalogo-gestion.controller.spec.ts`: el atajo de
 * desarrollo concede todos los permisos y por eso no sirve para probarlo por HTTP.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { PropuestaDeCatalogo, TarifaPropuesta } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { AplicadorDeCatalogo } from './application/aplicador-de-catalogo.js';

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

function comoTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return ContextoTenant.ejecutarCon(
    {
      tenantId,
      usuarioId: USUARIO_A,
      identidadId: null,
      permisos: new Set(['catalogo.administrar'] as const),
      trazaId: randomUUID(),
    },
    fn,
  );
}

const tarifa = (nombre: string, venta: string): TarifaPropuesta => ({
  nombre,
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  neto: null,
  venta: { unidades: venta, moneda: 'COP' },
  mayorista: null,
  aditiva: false,
  condicion: {
    acomodacion: null,
    tipoPasajero: null,
    edadMinima: null,
    edadMaxima: null,
    pasajerosMinimo: null,
    pasajerosMaximo: null,
    ocupaSilla: null,
  },
});

const propuesta = (nombre: string, tarifas: TarifaPropuesta[]): PropuestaDeCatalogo => ({
  version: 1,
  origen: 'API',
  productos: [
    {
      codigo: `E2E-${nombre}`,
      nombre,
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
      vigencias: [{ desde: '2027-02-01', hasta: '2027-02-01', publicada: false, tarifas }],
    },
  ],
});

async function contar(tenantId: string, nombre: string) {
  const paquetes = await admin.paquete.count({ where: { tenantId, nombre } });
  const tarifas = await admin.tarifa.count({
    where: { tenantId, vigencia: { paquete: { nombre } } },
  });
  return { paquetes, tarifas };
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
        slug: `fixture-aislamiento-gestion-${letra}-${id.slice(-8)}`,
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

describe('rutas /api/v1/catalogo/paquetes', () => {
  let paqueteId = '';

  it('POST crea el paquete (201), aparece en GET /paquetes y audita en la misma transacción', async () => {
    const r = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/paquetes', {
      nombre: 'Isla Corona',
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
    });
    expect(r.estado).toBe(201);
    paqueteId = String(r.json['id']);

    const lista = await llamar(TENANT_A, 'GET', '/api/v1/paquetes');
    const nombres = (lista.json['datos'] as { nombre: string }[]).map((p) => p.nombre);
    expect(nombres).toContain('Isla Corona');

    const filas = await admin.registroAuditoria.findMany({
      where: { tenantId: TENANT_A, entidadId: paqueteId },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'catalogo.paquete.creado',
      usuarioId: USUARIO_A,
      detalle: { origen: 'PANTALLA' },
    });
  });

  it('un cuerpo con tenantId responde 400 y no crea nada', async () => {
    const r = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/paquetes', {
      nombre: 'Colado',
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
      tenantId: TENANT_B,
    });
    expect(r.estado).toBe(400);
    expect(await contar(TENANT_B, 'Colado')).toEqual({ paquetes: 0, tarifas: 0 });
    expect(await contar(TENANT_A, 'Colado')).toEqual({ paquetes: 0, tarifas: 0 });
  });

  it('el tenant B no ve el paquete ni puede editarlo o desactivarlo (404)', async () => {
    const lista = await llamar(TENANT_B, 'GET', '/api/v1/paquetes');
    const nombres = (lista.json['datos'] as { nombre: string }[]).map((p) => p.nombre);
    expect(nombres).not.toContain('Isla Corona');

    const patch = await llamar(TENANT_B, 'PATCH', `/api/v1/catalogo/paquetes/${paqueteId}`, {
      nombre: 'Secuestrado',
    });
    expect(patch.estado).toBe(404);
    const baja = await llamar(
      TENANT_B,
      'POST',
      `/api/v1/catalogo/paquetes/${paqueteId}/desactivar`,
    );
    expect(baja.estado).toBe(404);

    const intacto = await admin.paquete.findUniqueOrThrow({ where: { id: paqueteId } });
    expect(intacto).toMatchObject({ nombre: 'Isla Corona', activo: true });
  });

  it('el tenant B, bajo RLS, no ve la fila de auditoría del tenant A', async () => {
    const prisma = app.get(PrismaService);
    const vistasPorB = await comoTenant(TENANT_B, () =>
      prisma.conTenant((tx) => tx.registroAuditoria.findMany({ where: { entidadId: paqueteId } })),
    );
    expect(vistasPorB).toHaveLength(0);
    const vistasPorA = await comoTenant(TENANT_A, () =>
      prisma.conTenant((tx) => tx.registroAuditoria.findMany({ where: { entidadId: paqueteId } })),
    );
    expect(vistasPorA).toHaveLength(1);
  });

  it('PATCH edita (200) y POST /desactivar da de baja sin borrar', async () => {
    const patch = await llamar(TENANT_A, 'PATCH', `/api/v1/catalogo/paquetes/${paqueteId}`, {
      destino: 'Islas del Rosario',
    });
    expect(patch.estado).toBe(200);
    expect((await admin.paquete.findUniqueOrThrow({ where: { id: paqueteId } })).destino).toBe(
      'Islas del Rosario',
    );

    const baja = await llamar(
      TENANT_A,
      'POST',
      `/api/v1/catalogo/paquetes/${paqueteId}/desactivar`,
    );
    expect(baja.estado).toBe(200);
    const fila = await admin.paquete.findUniqueOrThrow({ where: { id: paqueteId } });
    expect(fila).toMatchObject({ activo: false, eliminadoEn: null });

    const sinRuta = await llamar(TENANT_A, 'DELETE', `/api/v1/catalogo/paquetes/${paqueteId}`);
    expect(sinRuta.estado).toBe(404);
  });
});

describe('AplicadorDeCatalogo contra la base', () => {
  const aplicar = (tenantId: string, p: PropuestaDeCatalogo) =>
    comoTenant(tenantId, () =>
      app.get(AplicadorDeCatalogo, { strict: false }).aplicar(p, {
        tenantId,
        usuarioId: USUARIO_A,
        permisos: ['catalogo.administrar'],
      }),
    );

  it('aplica, y repetir la misma propuesta deja el mismo catálogo y la misma auditoría', async () => {
    const p = propuesta('Tour Idempotente', [tarifa('Adulto', '150000')]);
    const primera = await aplicar(TENANT_A, p);
    expect(primera.informe.resumen).toMatchObject({ creados: 1, errores: 0 });
    expect(await contar(TENANT_A, 'Tour Idempotente')).toEqual({ paquetes: 1, tarifas: 1 });
    const filas = await admin.registroAuditoria.count({ where: { tenantId: TENANT_A } });

    const segunda = await aplicar(TENANT_A, p);
    expect(segunda.informe.resumen).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 1 });
    expect(await contar(TENANT_A, 'Tour Idempotente')).toEqual({ paquetes: 1, tarifas: 1 });
    expect(await admin.registroAuditoria.count({ where: { tenantId: TENANT_A } })).toBe(filas);
  });

  it('un cambio de precio audita venta con el valor anterior y el nuevo, sin datos personales', async () => {
    await aplicar(TENANT_A, propuesta('Tour Precio', [tarifa('Adulto', '100000')]));
    await aplicar(TENANT_A, propuesta('Tour Precio', [tarifa('Adulto', '120000')]));

    const t = await admin.tarifa.findFirstOrThrow({
      where: { tenantId: TENANT_A, vigencia: { paquete: { nombre: 'Tour Precio' } } },
    });
    expect(t.ventaUnidades).toBe(120000n);
    const filas = await admin.registroAuditoria.findMany({
      where: { tenantId: TENANT_A, entidadId: t.id, accion: 'catalogo.tarifa.modificada' },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.detalle).toMatchObject({
      campo: 'venta',
      antes: '100000',
      despues: '120000',
      moneda: 'COP',
      origen: 'API',
    });
    expect(Object.keys(filas[0]?.detalle as object).sort()).toEqual(
      ['antes', 'campo', 'despues', 'huella', 'moneda', 'origen'].sort(),
    );
  });

  it('un error de la base a mitad no deja nada a medias: ni catálogo ni auditoría', async () => {
    const antes = await admin.registroAuditoria.count({ where: { tenantId: TENANT_A } });
    const dos: PropuestaDeCatalogo = {
      version: 1,
      origen: 'API',
      productos: [
        ...propuesta('Tour Atomico Uno', [tarifa('Adulto', '1000')]).productos,
        // 120 caracteres: pasa la validación del núcleo y revienta en `VARCHAR(80)` al escribir.
        ...propuesta('Tour Atomico Dos', [tarifa('x'.repeat(120), '1000')]).productos,
      ],
    };

    await expect(aplicar(TENANT_A, dos)).rejects.toBeDefined();

    expect(await contar(TENANT_A, 'Tour Atomico Uno')).toEqual({ paquetes: 0, tarifas: 0 });
    expect(await contar(TENANT_A, 'Tour Atomico Dos')).toEqual({ paquetes: 0, tarifas: 0 });
    expect(await admin.registroAuditoria.count({ where: { tenantId: TENANT_A } })).toBe(antes);
  });

  it('el catálogo de otro tenant no se ve ni se cambia: la misma propuesta crea la suya', async () => {
    const enB = await aplicar(TENANT_B, propuesta('Tour Idempotente', [tarifa('Adulto', '999')]));
    // Para B la propuesta es un alta: no encuentra el paquete de A por su clave natural.
    expect(enB.informe.resumen).toMatchObject({ creados: 1, actualizados: 0 });
    expect(enB.informe.noIncluidos).toEqual([]);

    const deA = await admin.tarifa.findFirstOrThrow({
      where: { tenantId: TENANT_A, vigencia: { paquete: { nombre: 'Tour Idempotente' } } },
    });
    expect(deA.ventaUnidades).toBe(150000n);
  });
});
