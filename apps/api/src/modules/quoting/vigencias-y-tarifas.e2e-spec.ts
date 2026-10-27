/**
 * Vigencias y tarifas por id contra PostgreSQL con RLS (ADR-0017 §4.1 y §8, T-043), por HTTP.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`, el que reconoce el limpiador).
 * No escribe en la agencia demo.
 *
 * Afirma:
 *   · crear una vigencia con tarifa (201) y cotizar contra ella: 2 adultos a 900000 = 1800000;
 *   · repetir la creación es idempotente (misma vigencia, sin filas nuevas de catálogo ni auditoría);
 *   · un empate (igual longitud, solapadas) es 409 VIGENCIA_EMPATADA y no guarda nada;
 *   · un cambio de venta audita campo, antes, después, moneda y origen PANTALLA, sin datos personales;
 *     DELETE audita `catalogo.tarifa.eliminada` con los valores previos;
 *   · el neto: sin `cotizacion.ver_neto_y_margen` es 403 y el listado no lo lleva;
 *   · aislamiento: el tenant B no lista, no crea, no edita ni borra sobre lo de A (404) ni cuelga un
 *     `mayoristaId` de A de una tarifa suya.
 *
 * El atajo de desarrollo concede todos los permisos: el 403 de `catalogo.administrar` lo cubre
 * `catalogo-vigencias.controller.spec.ts`; el del neto se prueba aquí llamando al controlador con
 * un contexto de permisos reducido.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { CatalogoVigenciasController } from './interface/catalogo-vigencias.controller.js';

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

const codigoDe = (json: Record<string, unknown>): unknown =>
  (json['error'] as { code?: unknown } | undefined)?.code;

const CONDICION = {
  acomodacion: null,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
};

const tarifa = (nombre: string, venta: string, extra: Record<string, unknown> = {}) => ({
  nombre,
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  neto: null,
  venta: { unidades: venta, moneda: 'COP' },
  mayoristaId: null,
  aditiva: false,
  condicion: CONDICION,
  ...extra,
});

const vigencia = (
  paqueteId: string,
  desde: string,
  hasta: string,
  tarifas = [tarifa('Adulto', '900000')],
) => ({
  paqueteId,
  desde,
  hasta,
  tarifas,
});

async function crearPaquete(tenantId: string, nombre: string): Promise<string> {
  const r = await llamar(tenantId, 'POST', '/api/v1/catalogo/paquetes', {
    nombre,
    destino: 'Cartagena',
    dias: 1,
    noches: 0,
  });
  expect(r.estado).toBe(201);
  return String(r.json['id']);
}

const filasDeCatalogo = async (tenantId: string) => ({
  vigencias: await admin.vigencia.count({ where: { tenantId } }),
  tarifas: await admin.tarifa.count({ where: { tenantId } }),
  auditoria: await admin.registroAuditoria.count({ where: { tenantId } }),
});

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
        slug: `fixture-aislamiento-vigencias-${letra}-${id.slice(-8)}`,
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

describe('vigencias y tarifas por id', () => {
  let paqueteId = '';
  let vigenciaId = '';
  let tarifaId = '';

  it('crea una vigencia con tarifa, aparece en el listado y cotiza 2 adultos = 1800000', async () => {
    paqueteId = await crearPaquete(TENANT_A, 'Isla Corona');
    const r = await llamar(
      TENANT_A,
      'POST',
      '/api/v1/catalogo/vigencias',
      vigencia(paqueteId, '2026-11-01', '2027-06-30'),
    );
    expect(r.estado).toBe(201);
    vigenciaId = String(r.json['id']);

    const lista = await llamar(TENANT_A, 'GET', `/api/v1/catalogo/paquetes/${paqueteId}/vigencias`);
    expect(lista.estado).toBe(200);
    const datos = lista.json['datos'] as {
      id: string;
      tarifas: { id: string; nombre: string }[];
    }[];
    expect(datos.map((v) => v.id)).toEqual([vigenciaId]);
    tarifaId = datos[0]?.tarifas[0]?.id ?? '';
    expect(datos[0]?.tarifas[0]?.nombre).toBe('Adulto');

    const cot = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/cotizar', {
      paqueteId,
      fecha: '2026-12-15',
      adultos: 2,
    });
    expect(cot.estado).toBe(200);
    expect(cot.json['total']).toEqual({ unidades: '1800000', moneda: 'COP' });
  });

  it('la creación deja la auditoría de precio en la misma transacción, con origen PANTALLA', async () => {
    const filas = await admin.registroAuditoria.findMany({
      where: { tenantId: TENANT_A, entidadId: tarifaId },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'catalogo.tarifa.creada',
      usuarioId: USUARIO_A,
      detalle: {
        campo: 'venta',
        antes: null,
        despues: '900000',
        moneda: 'COP',
        origen: 'PANTALLA',
      },
    });
  });

  it('repetir la misma creación es idempotente: misma vigencia, ninguna fila nueva', async () => {
    const antes = await filasDeCatalogo(TENANT_A);
    const r = await llamar(
      TENANT_A,
      'POST',
      '/api/v1/catalogo/vigencias',
      vigencia(paqueteId, '2026-11-01', '2027-06-30'),
    );
    expect(r.estado).toBe(201);
    expect(r.json['id']).toBe(vigenciaId);
    expect(await filasDeCatalogo(TENANT_A)).toEqual(antes);
  });

  it('la misma ventana con precio distinto es 409 VIGENCIA_DUPLICADA y no cambia nada', async () => {
    const antes = await filasDeCatalogo(TENANT_A);
    const r = await llamar(
      TENANT_A,
      'POST',
      '/api/v1/catalogo/vigencias',
      vigencia(paqueteId, '2026-11-01', '2027-06-30', [tarifa('Adulto', '1')]),
    );
    expect(r.estado).toBe(409);
    expect(codigoDe(r.json)).toBe('VIGENCIA_DUPLICADA');
    expect(await filasDeCatalogo(TENANT_A)).toEqual(antes);
  });

  it('un empate de vigencias (igual longitud, solapadas) es 409 VIGENCIA_EMPATADA y no guarda nada', async () => {
    const a = await llamar(
      TENANT_A,
      'POST',
      '/api/v1/catalogo/vigencias',
      vigencia(paqueteId, '2027-01-01', '2027-01-31'),
    );
    expect(a.estado).toBe(201);
    const antes = await filasDeCatalogo(TENANT_A);

    const b = await llamar(
      TENANT_A,
      'POST',
      '/api/v1/catalogo/vigencias',
      vigencia(paqueteId, '2027-01-15', '2027-02-14'),
    );
    expect(b.estado).toBe(409);
    expect(codigoDe(b.json)).toBe('VIGENCIA_EMPATADA');
    expect(await filasDeCatalogo(TENANT_A)).toEqual(antes);

    // Mover una vigencia existente a un empate tampoco se guarda.
    const c = await llamar(
      TENANT_A,
      'POST',
      '/api/v1/catalogo/vigencias',
      vigencia(paqueteId, '2027-03-01', '2027-03-31'),
    );
    const movida = await llamar(
      TENANT_A,
      'PATCH',
      `/api/v1/catalogo/vigencias/${String(c.json['id'])}`,
      { desde: '2027-01-15', hasta: '2027-02-14' },
    );
    expect(movida.estado).toBe(409);
    expect(codigoDe(movida.json)).toBe('VIGENCIA_EMPATADA');
    const intacta = await admin.vigencia.findUniqueOrThrow({ where: { id: String(c.json['id']) } });
    expect(intacta.desde.toISOString().slice(0, 10)).toBe('2027-03-01');
  });

  it('PATCH de la venta audita campo, antes, después, moneda y origen, sin datos personales', async () => {
    const r = await llamar(TENANT_A, 'PATCH', `/api/v1/catalogo/tarifas/${tarifaId}`, {
      venta: { unidades: '950000', moneda: 'COP' },
    });
    expect(r.estado).toBe(200);
    expect((await admin.tarifa.findUniqueOrThrow({ where: { id: tarifaId } })).ventaUnidades).toBe(
      950000n,
    );

    const filas = await admin.registroAuditoria.findMany({
      where: { tenantId: TENANT_A, entidadId: tarifaId, accion: 'catalogo.tarifa.modificada' },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.detalle).toMatchObject({
      campo: 'venta',
      antes: '900000',
      despues: '950000',
      moneda: 'COP',
      origen: 'PANTALLA',
    });
    expect(Object.keys(filas[0]?.detalle as object).sort()).toEqual(
      ['antes', 'campo', 'despues', 'huella', 'moneda', 'origen'].sort(),
    );
  });

  it('POST de una tarifa nueva y PATCH idéntico no escriben de más', async () => {
    const r = await llamar(
      TENANT_A,
      'POST',
      `/api/v1/catalogo/vigencias/${vigenciaId}/tarifas`,
      tarifa('Niño', '500000'),
    );
    expect(r.estado).toBe(201);
    const ninoId = String(r.json['id']);

    const antes = await filasDeCatalogo(TENANT_A);
    const igual = await llamar(TENANT_A, 'PATCH', `/api/v1/catalogo/tarifas/${ninoId}`, {
      venta: { unidades: '500000', moneda: 'COP' },
    });
    expect(igual.estado).toBe(200);
    expect(await filasDeCatalogo(TENANT_A)).toEqual(antes);
  });

  it('el neto exige cotizacion.ver_neto_y_margen: 403 sin él y el listado no lo lleva', async () => {
    const controlador = app.get(CatalogoVigenciasController, { strict: false });
    await expect(
      comoConPermisos(TENANT_A, ['catalogo.administrar'], () =>
        controlador.editarTarifa(tarifaId, { neto: { unidades: '700000', moneda: 'COP' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const sinCambio = await admin.tarifa.findUniqueOrThrow({ where: { id: tarifaId } });
    expect(sinCambio.netoUnidades).toBeNull();

    // Con el permiso se guarda y se audita; sin él, el listado omite la clave.
    await comoConPermisos(TENANT_A, ['catalogo.administrar', 'cotizacion.ver_neto_y_margen'], () =>
      controlador.editarTarifa(tarifaId, { neto: { unidades: '700000', moneda: 'COP' } }),
    );
    const sin = await comoConPermisos(TENANT_A, ['catalogo.administrar'], () =>
      controlador.listar(paqueteId),
    );
    expect(JSON.stringify(sin)).not.toContain('700000');
    expect(sin.datos[0]?.tarifas[0]).not.toHaveProperty('neto');
    const con = await comoConPermisos(
      TENANT_A,
      ['catalogo.administrar', 'cotizacion.ver_neto_y_margen'],
      () => controlador.listar(paqueteId),
    );
    expect(con.datos[0]?.tarifas.find((t) => t.id === tarifaId)?.neto).toEqual({
      unidades: '700000',
      moneda: 'COP',
    });
  });

  it('DELETE borra la tarifa y audita catalogo.tarifa.eliminada con los valores previos', async () => {
    const r = await llamar(TENANT_A, 'DELETE', `/api/v1/catalogo/tarifas/${tarifaId}`);
    expect(r.estado).toBe(200);
    expect(await admin.tarifa.count({ where: { id: tarifaId } })).toBe(0);

    const fila = await admin.registroAuditoria.findFirstOrThrow({
      where: { tenantId: TENANT_A, entidadId: tarifaId, accion: 'catalogo.tarifa.eliminada' },
    });
    expect(fila.detalle).toMatchObject({
      nombre: 'Adulto',
      venta: '950000',
      moneda: 'COP',
      origen: 'PANTALLA',
    });
  });

  describe('aislamiento entre agencias', () => {
    let tarifaDeA = '';
    let mayoristaDeA = '';

    it('el tenant B no lista, no crea vigencia, no crea tarifa, no edita ni borra sobre lo de A (404)', async () => {
      const ninoA = await admin.tarifa.findFirstOrThrow({
        where: { tenantId: TENANT_A, nombre: 'Niño' },
      });
      tarifaDeA = ninoA.id;

      const antesA = await filasDeCatalogo(TENANT_A);
      const antesB = await filasDeCatalogo(TENANT_B);

      const lista = await llamar(
        TENANT_B,
        'GET',
        `/api/v1/catalogo/paquetes/${paqueteId}/vigencias`,
      );
      expect(lista.estado).toBe(404);

      const nuevaV = await llamar(
        TENANT_B,
        'POST',
        '/api/v1/catalogo/vigencias',
        vigencia(paqueteId, '2028-01-01', '2028-01-31'),
      );
      expect(nuevaV.estado).toBe(404);

      const nuevaT = await llamar(
        TENANT_B,
        'POST',
        `/api/v1/catalogo/vigencias/${vigenciaId}/tarifas`,
        tarifa('Colada', '1'),
      );
      expect(nuevaT.estado).toBe(404);

      const edita = await llamar(TENANT_B, 'PATCH', `/api/v1/catalogo/tarifas/${tarifaDeA}`, {
        venta: { unidades: '1', moneda: 'COP' },
      });
      expect(edita.estado).toBe(404);
      const mueve = await llamar(TENANT_B, 'PATCH', `/api/v1/catalogo/vigencias/${vigenciaId}`, {
        publicada: false,
        cupoTotal: 5,
      });
      expect(mueve.estado).toBe(404);
      const borra = await llamar(TENANT_B, 'DELETE', `/api/v1/catalogo/tarifas/${tarifaDeA}`);
      expect(borra.estado).toBe(404);

      expect(await filasDeCatalogo(TENANT_A)).toEqual(antesA);
      expect(await filasDeCatalogo(TENANT_B)).toEqual(antesB);
      expect(
        (await admin.tarifa.findUniqueOrThrow({ where: { id: tarifaDeA } })).ventaUnidades,
      ).toBe(500000n);
    });

    it('el tenant B no cuelga un mayoristaId de A de una tarifa suya (404) ni se guarda nada', async () => {
      mayoristaDeA = (
        await admin.mayorista.create({ data: { tenantId: TENANT_A, nombre: 'Mayorista de A' } })
      ).id;
      const paqueteB = await crearPaquete(TENANT_B, 'Isla Corona B');
      const vB = await llamar(
        TENANT_B,
        'POST',
        '/api/v1/catalogo/vigencias',
        vigencia(paqueteB, '2026-11-01', '2027-06-30'),
      );
      expect(vB.estado).toBe(201);
      const antesB = await filasDeCatalogo(TENANT_B);

      const nueva = await llamar(
        TENANT_B,
        'POST',
        `/api/v1/catalogo/vigencias/${String(vB.json['id'])}/tarifas`,
        tarifa('Con mayorista ajeno', '1000', { mayoristaId: mayoristaDeA }),
      );
      expect(nueva.estado).toBe(404);
      expect(codigoDe(nueva.json)).toBe('MAYORISTA_NO_ENCONTRADO');

      const enVigencia = await llamar(
        TENANT_B,
        'POST',
        '/api/v1/catalogo/vigencias',
        vigencia(paqueteB, '2028-01-01', '2028-01-31', [
          tarifa('Adulto', '1000', { mayoristaId: mayoristaDeA }),
        ]),
      );
      expect(enVigencia.estado).toBe(404);

      const tarifaB = await admin.tarifa.findFirstOrThrow({
        where: { tenantId: TENANT_B, nombre: 'Adulto' },
      });
      const edita = await llamar(TENANT_B, 'PATCH', `/api/v1/catalogo/tarifas/${tarifaB.id}`, {
        mayoristaId: mayoristaDeA,
      });
      expect(edita.estado).toBe(404);

      expect(await filasDeCatalogo(TENANT_B)).toEqual(antesB);
      expect(await admin.tarifa.count({ where: { mayoristaId: mayoristaDeA } })).toBe(0);
    });
  });
});
