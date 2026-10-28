/**
 * Confirmar una importación de catálogo contra PostgreSQL con RLS (ADR-0017 §4.2), por HTTP.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`, el que reconoce el limpiador).
 *
 * Afirma:
 *   · confirmar una hoja de 19 productos (17 con precio) crea 19 paquetes y 17 tarifas;
 *   · confirmarla otra vez (con la huella de la primera previsualización) responde
 *     creados 0, actualizados 0, sinCambios 19 y no añade filas de catálogo ni de auditoría;
 *   · cambiar un precio escribe `catalogo.tarifa.modificada` con origen ARCHIVO y la huella, y una
 *     fila `catalogo.propuesta_aplicada` con el mapeo sugerido y el confirmado;
 *   · una fila con error rechaza todo (422) sin escribir; una huella vieja con el catálogo
 *     cambiado es 409 `PROPUESTA_CAMBIO`;
 *   · no borra ni desactiva lo que no viene en la hoja;
 *   · la agencia B no ve nada de lo importado por A;
 *   · la auditoría no contiene datos personales (solo importes, moneda, origen, huella).
 *
 * El 403 sin `catalogo.administrar` lo cubre `importaciones.controller.spec.ts` (metadata), y el
 * 403 por neto sin permiso lo cubre `confirmar-importacion.use-case.spec.ts`: el atajo de
 * desarrollo concede todos los permisos y no sirve para probarlos por HTTP.
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
import {
  cuerpoDeImportaciones,
  RUTA_DE_IMPORTACIONES,
} from '../../shared/red/cuerpo-de-importaciones.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const USUARIO_A = randomUUID();
const PREVISUALIZAR = `${RUTA_DE_IMPORTACIONES}/previsualizar`;
const CONFIRMAR = `${RUTA_DE_IMPORTACIONES}/confirmar`;

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;

async function llamar(tenantId: string, ruta: string, cuerpo: unknown) {
  const r = await fetch(new URL(ruta, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': tenantId,
      'x-dev-usuario-id': USUARIO_A,
    },
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    // El estado es lo que se afirma.
  }
  return { estado: r.status, json };
}

async function conteos(tenantId: string) {
  return {
    paquetes: await admin.paquete.count({ where: { tenantId } }),
    paquetesActivos: await admin.paquete.count({ where: { tenantId, activo: true } }),
    vigencias: await admin.vigencia.count({ where: { tenantId } }),
    tarifas: await admin.tarifa.count({ where: { tenantId } }),
    auditoria: await admin.registroAuditoria.count({ where: { tenantId } }),
    tarifasModificadas: await admin.registroAuditoria.count({
      where: { tenantId, accion: 'catalogo.tarifa.modificada' },
    }),
  };
}

const ENCABEZADOS = ['Tour', 'Destino', 'Fecha salida', 'Precio'];
const MAPEO = {
  formato: 'excursion-un-dia',
  columnas: { nombre: 0, destino: 1, vigencia_desde: 2, precio_venta: 3 },
  moneda: 'COP',
};
const SUGERIDO = {
  formato: 'excursion-un-dia',
  version: 1,
  columnas: { nombre: { indice: 0, confianza: 0.9 } },
  sinMapear: [],
};
const tabla = (filas: string[][]) => ({ encabezados: ENCABEZADOS, filas });

/** 19 productos: 17 con precio y 2 sin él (paquete sin tarifa, con aviso). */
function hoja(precioDelPrimero = '300.000'): string[][] {
  return Array.from({ length: 19 }, (_, i) => [
    `Tour importado ${i + 1}`,
    'Cartagena',
    '01/02/2027',
    i === 0 ? precioDelPrimero : i < 17 ? `${(i + 1) * 10}.000` : '',
  ]);
}

async function previsualizar(tenantId: string, filas: string[][]) {
  const r = await llamar(tenantId, PREVISUALIZAR, { tabla: tabla(filas), mapeo: MAPEO });
  expect(r.estado).toBe(200);
  return r.json['huella'] as string;
}

const confirmar = (tenantId: string, filas: string[][], huella: string) =>
  llamar(tenantId, CONFIRMAR, {
    tabla: tabla(filas),
    mapeo: MAPEO,
    mapeoSugerido: SUGERIDO,
    huella,
  });

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
        slug: `fixture-aislamiento-confirmar-${letra}-${id.slice(-8)}`,
        nombre: `Agencia ${letra}`,
      },
    });
  }

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  app.use(RUTA_DE_IMPORTACIONES, cuerpoDeImportaciones());
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

describe('POST /api/v1/catalogo/importaciones/confirmar', () => {
  // Las pruebas se encadenan sobre el catálogo de A (orden de declaración).
  let huellaDeLaPrimera = '';

  it('una fila con error rechaza todo (422) y no escribe nada', async () => {
    const filas = [...hoja(), ['Barú', 'Cartagena', '31/02/2027', '100.000']];
    const huella = await previsualizar(TENANT_A, filas);
    const antes = await conteos(TENANT_A);
    const r = await confirmar(TENANT_A, filas, huella);
    expect(r.estado).toBe(422);
    expect(await conteos(TENANT_A)).toEqual(antes);
  });

  it('confirma: crea 19 paquetes y 17 tarifas, con la auditoría del lote', async () => {
    const filas = hoja();
    const huella = await previsualizar(TENANT_A, filas);
    huellaDeLaPrimera = huella;
    const r = await confirmar(TENANT_A, filas, huella);
    expect(r.estado).toBe(200);
    expect((r.json['informe'] as { resumen: Record<string, number> }).resumen).toMatchObject({
      creados: 19,
      actualizados: 0,
      sinCambios: 0,
    });
    const c = await conteos(TENANT_A);
    expect(c.paquetes).toBe(19);
    expect(c.tarifas).toBe(17);

    const lote = await admin.registroAuditoria.findFirst({
      where: { tenantId: TENANT_A, accion: 'catalogo.propuesta_aplicada' },
    });
    expect(lote?.detalle).toMatchObject({
      origen: 'ARCHIVO',
      creados: 19,
      mapeoConfirmado: MAPEO,
      mapeoSugerido: SUGERIDO,
    });
  });

  it('confirmarla otra vez, con la huella vieja, converge: nada nuevo en catálogo ni auditoría', async () => {
    const filas = hoja();
    const antes = await conteos(TENANT_A);
    // La huella de la primera previsualización (catálogo vacío): ya no coincide con el estado,
    // pero el plan está convergido y reintentar es seguro.
    const r = await confirmar(TENANT_A, filas, huellaDeLaPrimera);
    expect(r.estado).toBe(200);
    expect((r.json['informe'] as { resumen: Record<string, number> }).resumen).toMatchObject({
      creados: 0,
      actualizados: 0,
      sinCambios: 19,
    });
    expect(await conteos(TENANT_A)).toEqual(antes);
  });

  it('una huella ya inservible con el catálogo cambiado es 409 PROPUESTA_CAMBIO', async () => {
    const filas = hoja('320.000');
    const huella = await previsualizar(TENANT_A, filas);
    // Alguien confirma antes otro precio distinto para el mismo producto.
    const otra = hoja('330.000');
    const r1 = await confirmar(TENANT_A, otra, await previsualizar(TENANT_A, otra));
    expect(r1.estado).toBe(200);
    const antes = await conteos(TENANT_A);

    const r2 = await confirmar(TENANT_A, filas, huella);
    expect(r2.estado).toBe(409);
    expect((r2.json['error'] as { code: string }).code).toBe('PROPUESTA_CAMBIO');
    expect(await conteos(TENANT_A)).toEqual(antes);
  });

  it('cambiar un precio audita tarifa.modificada con origen ARCHIVO y la huella; no desactiva nada', async () => {
    const antes = await conteos(TENANT_A);
    const filas = hoja('350.000').slice(0, 5); // solo 5 de los 19: el resto no se toca
    const huella = await previsualizar(TENANT_A, filas);
    const r = await confirmar(TENANT_A, filas, huella);
    expect(r.estado).toBe(200);

    const despues = await conteos(TENANT_A);
    expect(despues.paquetes).toBe(antes.paquetes);
    expect(despues.paquetesActivos).toBe(antes.paquetesActivos);
    expect(despues.tarifasModificadas).toBe(antes.tarifasModificadas + 1);

    const filaDePrecio = await admin.registroAuditoria.findFirst({
      where: { tenantId: TENANT_A, accion: 'catalogo.tarifa.modificada' },
      orderBy: { id: 'desc' },
    });
    expect(filaDePrecio?.detalle).toMatchObject({
      campo: 'venta',
      antes: '330000',
      despues: '350000',
      moneda: 'COP',
      origen: 'ARCHIVO',
    });
    expect((filaDePrecio?.detalle as { huella: string }).huella).toMatch(/^[0-9a-f]{64}$/);
  });

  it('la auditoría no lleva datos personales', async () => {
    const filas = await admin.registroAuditoria.findMany({ where: { tenantId: TENANT_A } });
    const permitidas = new Set([
      'campo',
      'antes',
      'despues',
      'moneda',
      'origen',
      'huella',
      'nombre',
      'creados',
      'actualizados',
      'sinCambios',
      'mapeoConfirmado',
      'mapeoSugerido',
    ]);
    for (const f of filas) {
      for (const clave of Object.keys((f.detalle ?? {}) as Record<string, unknown>)) {
        expect(permitidas.has(clave), `${f.accion}: ${clave}`).toBe(true);
      }
    }
  });

  it('aislamiento: la agencia B no ve lo importado por A, y confirmar en B no toca A', async () => {
    const deB = await conteos(TENANT_B);
    expect(deB).toMatchObject({ paquetes: 0, tarifas: 0, auditoria: 0 });
    const antesA = await conteos(TENANT_A);

    const filas = hoja();
    const r = await confirmar(TENANT_B, filas, await previsualizar(TENANT_B, filas));
    expect(r.estado).toBe(200);
    expect((r.json['informe'] as { resumen: Record<string, number> }).resumen).toMatchObject({
      creados: 19,
      sinCambios: 0,
    });
    expect(await conteos(TENANT_A)).toEqual(antesA);
    expect((await conteos(TENANT_B)).paquetes).toBe(19);
  });

  it('un tenantId o una huella mal formada en el cuerpo es 400', async () => {
    const filas = hoja();
    const colado = await llamar(TENANT_A, CONFIRMAR, {
      tabla: tabla(filas),
      mapeo: MAPEO,
      huella: 'a'.repeat(64),
      tenantId: TENANT_B,
    });
    expect(colado.estado).toBe(400);
    const sinHuella = await llamar(TENANT_A, CONFIRMAR, { tabla: tabla(filas), mapeo: MAPEO });
    expect(sinHuella.estado).toBe(400);
  });
});
