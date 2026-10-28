/**
 * Previsualizar una importación de catálogo contra PostgreSQL con RLS (ADR-0017 §4.2), por HTTP.
 *
 * Fixtures propios: dos agencias (prefijo `fixture-aislamiento-`, el que reconoce el limpiador).
 *
 * Afirma:
 *   · previsualizar no cambia el número de paquetes, vigencias, tarifas ni filas de auditoría;
 *   · el informe distingue nuevo, cambia precio, sin cambio y error por fila (con fila y columna);
 *   · más de 2.000 filas o más de 2 MB de cuerpo es 413, sin validar filas;
 *   · un mapeo inválido es 400 y un `tenantId` en el cuerpo también;
 *   · otra agencia no ve el catálogo de la primera: la misma tabla le sale toda «nueva»;
 *   · sugerir-mapeo responde por sinónimos.
 *
 * El 403 sin `catalogo.administrar` lo cubre `importaciones.controller.spec.ts`: el atajo de
 * desarrollo concede todos los permisos y no sirve para probarlo por HTTP.
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
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { AplicadorDeCatalogo } from './application/aplicador-de-catalogo.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const USUARIO_A = randomUUID();
const RUTA = `${RUTA_DE_IMPORTACIONES}/previsualizar`;

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
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    // Un 413 de un analizador puede no traer JSON: el estado es lo que se afirma.
  }
  return { estado: r.status, json };
}

async function conteos(tenantId: string) {
  return {
    paquetes: await admin.paquete.count({ where: { tenantId } }),
    vigencias: await admin.vigencia.count({ where: { tenantId } }),
    tarifas: await admin.tarifa.count({ where: { tenantId } }),
    auditoria: await admin.registroAuditoria.count({ where: { tenantId } }),
  };
}

const ENCABEZADOS = ['Tour', 'Destino', 'Fecha salida', 'Precio'];
const MAPEO = {
  formato: 'excursion-un-dia',
  columnas: { nombre: 0, destino: 1, vigencia_desde: 2, precio_venta: 3 },
  moneda: 'COP',
};
const tabla = (filas: string[][]) => ({ encabezados: ENCABEZADOS, filas });

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
        slug: `fixture-aislamiento-importacion-${letra}-${id.slice(-8)}`,
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

  // El catálogo de A: un paquete con una tarifa de 300.000.
  await ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT_A,
      usuarioId: USUARIO_A,
      identidadId: null,
      permisos: new Set(['catalogo.administrar'] as const),
      trazaId: randomUUID(),
    },
    () =>
      app.get(AplicadorDeCatalogo, { strict: false }).aplicar(
        {
          version: 1,
          origen: 'API',
          productos: [
            {
              codigo: 'IMP-1',
              nombre: 'Isla Palma',
              destino: 'Cartagena',
              dias: 1,
              noches: 0,
              vigencias: [
                {
                  desde: '2027-02-01',
                  hasta: '2027-02-01',
                  publicada: false,
                  tarifas: [
                    {
                      nombre: 'General',
                      unidad: 'POR_PERSONA',
                      cubrePasajeros: 1,
                      neto: null,
                      venta: { unidades: '300000', moneda: 'COP' },
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
                    },
                  ],
                },
              ],
            },
          ],
        },
        { tenantId: TENANT_A, usuarioId: USUARIO_A, permisos: ['catalogo.administrar'] },
      ),
  );
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

describe('POST /api/v1/catalogo/importaciones/previsualizar', () => {
  const filas = [
    ['Isla Palma', 'Cartagena', '01/02/2027', '320.000'], // cambia precio
    ['Rosario', 'Cartagena', '01/02/2027', '100.000'], // nuevo
    ['Barú', 'Cartagena', '31/02/2027', '100.000'], // error de fecha
    ['Mantas', 'Cartagena', '', ''], // sin precio
  ];

  it('informa por fila y no escribe nada (paquetes, vigencias, tarifas ni auditoría)', async () => {
    const antes = await conteos(TENANT_A);
    const r = await llamar(TENANT_A, RUTA, { tabla: tabla(filas), mapeo: MAPEO });
    expect(r.estado).toBe(200);
    const informe = r.json['informe'] as {
      resumen: Record<string, number>;
      elementos: { codigo: string; procedencia?: { fila: number; columna: string } }[];
    };
    expect(informe.resumen).toMatchObject({ creados: 2, actualizados: 1, errores: 1, avisos: 1 });
    expect(informe.elementos.find((e) => e.codigo === 'FECHA_INVALIDA')?.procedencia).toEqual({
      fila: 4,
      columna: 'Fecha salida',
    });
    expect(r.json['huella']).toMatch(/^[0-9a-f]{64}$/);
    expect(await conteos(TENANT_A)).toEqual(antes);
  });

  it('con {propuesta} tampoco escribe', async () => {
    const antes = await conteos(TENANT_A);
    const r = await llamar(TENANT_A, RUTA, {
      propuesta: {
        version: 1,
        origen: 'API',
        productos: [
          {
            codigo: 'IMP-2',
            nombre: 'Nuevo',
            destino: 'Santa Marta',
            dias: 1,
            noches: 0,
            vigencias: [],
          },
        ],
      },
    });
    expect(r.estado).toBe(200);
    expect(await conteos(TENANT_A)).toEqual(antes);
  });

  it('más de 2.000 filas es 413 y no valida ninguna', async () => {
    const r = await llamar(TENANT_A, RUTA, {
      tabla: tabla(Array.from({ length: 2001 }, () => ['x', 'y', 'z', '1'])),
      mapeo: MAPEO,
    });
    expect(r.estado).toBe(413);
  });

  it('más de 2 MB de cuerpo es 413', async () => {
    const r = await llamar(TENANT_A, RUTA, {
      tabla: tabla(
        [['x'.repeat(1900), 'y', 'z', '1']].concat(
          Array(1200).fill(['x'.repeat(1900), '', '', '']),
        ),
      ),
      mapeo: MAPEO,
    });
    expect(r.estado).toBe(413);
  });

  it('un mapeo inválido es 400, y un tenantId en el cuerpo también', async () => {
    const sinFormato = await llamar(TENANT_A, RUTA, {
      tabla: tabla(filas),
      mapeo: { ...MAPEO, formato: 'no-existe' },
    });
    expect(sinFormato.estado).toBe(400);
    const sinPrecio = await llamar(TENANT_A, RUTA, {
      tabla: tabla(filas),
      mapeo: { ...MAPEO, columnas: { nombre: 0 } },
    });
    expect(sinPrecio.estado).toBe(400);
    const colado = await llamar(TENANT_A, RUTA, {
      tabla: tabla(filas),
      mapeo: MAPEO,
      tenantId: TENANT_B,
    });
    expect(colado.estado).toBe(400);
  });

  it('aislamiento: la agencia B no ve el catálogo de A, y las huellas difieren', async () => {
    const deA = await llamar(TENANT_A, RUTA, { tabla: tabla(filas), mapeo: MAPEO });
    const deB = await llamar(TENANT_B, RUTA, { tabla: tabla(filas), mapeo: MAPEO });
    const informeB = deB.json['informe'] as {
      resumen: Record<string, number>;
      noIncluidos: unknown[];
    };
    expect(informeB.resumen).toMatchObject({ creados: 3, actualizados: 0, sinCambios: 0 });
    expect(informeB.noIncluidos).toEqual([]);
    expect(deB.json['huella']).not.toBe(deA.json['huella']);
  });
});

describe('POST /api/v1/catalogo/importaciones/sugerir-mapeo', () => {
  it('con marcador, confianza 1; sin marcador, por sinónimos', async () => {
    const conMarcador = await llamar(TENANT_A, `${RUTA_DE_IMPORTACIONES}/sugerir-mapeo`, {
      marcador: '#viajapro;plantilla=excursion-un-dia;version=1',
      encabezados: ['Nombre del producto', 'Destino', 'Nombre de la tarifa'],
    });
    expect(conMarcador.estado).toBe(200);
    const columnas = conMarcador.json['columnas'] as Record<string, { confianza: number }>;
    expect(columnas['nombre']?.confianza).toBe(1);

    const porSinonimos = await llamar(TENANT_A, `${RUTA_DE_IMPORTACIONES}/sugerir-mapeo`, {
      encabezados: ['Tour', 'PVP', 'Color'],
    });
    expect(porSinonimos.json['sinMapear']).toEqual([2]);
  });
});
