/**
 * Campos extendidos del catálogo (T-049, ADR-0017 M2) contra PostgreSQL con RLS, por HTTP y por el
 * aplicador. Fixtures propios: dos agencias con prefijo `fixture-aislamiento-`.
 *
 * Afirma:
 *   · código, formato, cargos en destino, campos personalizados, lista, promo y opciones de salida
 *     hacen ida y vuelta (aplicador -> base -> GET /paquetes);
 *   · aplicar dos veces la misma propuesta no cambia nada (idempotente);
 *   · un campo personalizado sin definición o de tipo inválido rechaza TODO (PROPUESTA_INVALIDA);
 *   · cotizar Isla Palma con 2 adultos: el total NO incluye la tasa portuaria y la respuesta la
 *     lista aparte (29000 COP POR_PERSONA);
 *   · cotizar sin opción cuando el producto las tiene = OPCION_DE_SALIDA_REQUERIDA (422); con Lancha
 *     usa solo su tarifa;
 *   · un paquete sin campos nuevos sigue cotizando igual (cargos vacíos, sin opción);
 *   · formatos: crear, editar, plantilla con los campos personalizados que declara;
 *   · aislamiento A/B: B recibe 404 por el formato de A y no puede usar su opción de salida.
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

const codigoDeError = (json: Record<string, unknown>): unknown =>
  (json['error'] as { code?: unknown } | undefined)?.code;

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

const tarifa = (
  nombre: string,
  venta: string,
  extra: Partial<TarifaPropuesta> = {},
): TarifaPropuesta => ({
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
  ...extra,
});

const isla = (): PropuestaDeCatalogo => ({
  version: 1,
  origen: 'API',
  productos: [
    {
      codigo: 'E2E-ISLA-PALMA',
      nombre: 'Isla Palma',
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
      formato: 'Pasadía e2e',
      planAlimentacion: null,
      cargosEnDestino: [
        {
          concepto: 'Tasa portuaria',
          monto: { unidades: '29000', moneda: 'COP' },
          unidad: 'POR_PERSONA',
          nota: 'Se paga en el muelle',
        },
      ],
      camposPersonalizados: { restricciones: 'Mayores de 4 años' },
      opcionesDeSalida: [
        { etiqueta: 'Lancha', horaSalida: '07:30', horaRegreso: '16:00' },
        { etiqueta: 'Terrestre', puntoDeEncuentro: 'Hotel' },
      ],
      vigencias: [
        {
          desde: '2027-02-01',
          hasta: '2027-02-28',
          publicada: false,
          tarifas: [
            tarifa('Adulto lancha', '320000', {
              opcionDeSalida: 'Lancha',
              lista: { unidades: '380000', moneda: 'COP' },
              promoHasta: '2027-01-31',
            }),
            tarifa('Adulto terrestre', '250000', { opcionDeSalida: 'Terrestre' }),
          ],
        },
      ],
    },
  ],
});

let formatoId = '';

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
        slug: `fixture-aislamiento-extendidos-${letra}-${id.slice(-8)}`,
        nombre: `Agencia ${letra}`,
      },
    });
  }
  await admin.definicionCampoPersonalizado.create({
    data: {
      tenantId: TENANT_A,
      entidad: 'PAQUETE',
      clave: 'restricciones',
      etiqueta: 'Restricciones',
      tipo: 'TEXTO',
    },
  });
  await admin.definicionCampoPersonalizado.create({
    data: {
      tenantId: TENANT_A,
      entidad: 'PAQUETE',
      clave: 'nivel',
      etiqueta: 'Nivel',
      tipo: 'SELECCION',
      opciones: ['facil', 'duro'],
    },
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

describe('formatos de viaje', () => {
  it('POST crea (201), PATCH edita, GET lista y un nombre repetido es 409', async () => {
    const r = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/formatos', {
      nombre: 'Pasadía e2e',
      plantilla: { obligatorios: ['codigo'], camposPersonalizados: ['restricciones', 'nivel'] },
    });
    expect(r.estado).toBe(201);
    formatoId = String(r.json['id']);

    const repetido = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/formatos', {
      nombre: 'pasadia E2E',
    });
    expect(repetido.estado).toBe(409);

    const editado = await llamar(TENANT_A, 'PATCH', `/api/v1/catalogo/formatos/${formatoId}`, {
      orden: 3,
    });
    expect(editado.estado).toBe(200);
    expect(editado.json['orden']).toBe(3);

    const lista = await llamar(TENANT_A, 'GET', '/api/v1/catalogo/formatos');
    expect((lista.json['datos'] as { id: string }[]).map((f) => f.id)).toContain(formatoId);
  });

  it('una plantilla con claves desconocidas es 400', async () => {
    const r = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/formatos', {
      nombre: 'Malo',
      plantilla: { inventado: true },
    });
    expect(r.estado).toBe(400);
  });

  it('GET /:id/plantilla devuelve las columnas e incluye los campos personalizados declarados', async () => {
    const r = await llamar(TENANT_A, 'GET', `/api/v1/catalogo/formatos/${formatoId}/plantilla`);
    expect(r.estado).toBe(200);
    const claves = (r.json['columnas'] as { clave: string; obligatoria: boolean }[]).map(
      (c) => c.clave,
    );
    expect(claves).toContain('campo_restricciones');
    expect(claves).toContain('campo_nivel');
    expect(claves).toContain('precio_venta');
    const codigo = (r.json['columnas'] as { clave: string; obligatoria: boolean }[]).find(
      (c) => c.clave === 'codigo',
    );
    expect(codigo?.obligatoria).toBe(true);
  });

  it('el tenant B recibe 404 al pedir la plantilla de un formato de A (y al editarlo)', async () => {
    const r = await llamar(TENANT_B, 'GET', `/api/v1/catalogo/formatos/${formatoId}/plantilla`);
    expect(r.estado).toBe(404);
    const e = await llamar(TENANT_B, 'PATCH', `/api/v1/catalogo/formatos/${formatoId}`, {
      activo: false,
    });
    expect(e.estado).toBe(404);
    const lista = await llamar(TENANT_B, 'GET', '/api/v1/catalogo/formatos');
    expect((lista.json['datos'] as { id: string }[]).map((f) => f.id)).not.toContain(formatoId);
  });
});

describe('ida y vuelta de los campos extendidos', () => {
  let paqueteId = '';

  it('el aplicador persiste todos los campos y el listado los devuelve', async () => {
    const aplicador = app.get(AplicadorDeCatalogo);
    const resultado = await comoTenant(TENANT_A, () =>
      aplicador.aplicar(isla(), {
        tenantId: TENANT_A,
        usuarioId: USUARIO_A,
        permisos: ['catalogo.administrar'],
      }),
    );
    expect(resultado.informe.resumen.errores).toBe(0);
    expect(resultado.informe.elementos.map((e) => e.codigo)).not.toContain(
      'CAMPO_NO_SOPORTADO_AUN',
    );
    paqueteId = resultado.paquetes[0]?.id ?? '';

    const fila = await admin.paquete.findFirstOrThrow({
      where: { id: paqueteId },
      include: { opcionesDeSalida: { orderBy: { orden: 'asc' } } },
    });
    expect(fila.codigo).toBe('E2E-ISLA-PALMA');
    expect(fila.formatoId).toBe(formatoId);
    expect(fila.planAlimentacion).toBeNull();
    expect(fila.camposPersonalizados).toEqual({ restricciones: 'Mayores de 4 años' });
    expect(fila.opcionesDeSalida.map((o) => o.etiqueta)).toEqual(['Lancha', 'Terrestre']);

    const tarifas = await admin.tarifa.findMany({ where: { tenantId: TENANT_A } });
    const lancha = tarifas.find((t) => t.nombre === 'Adulto lancha');
    expect(lancha?.listaUnidades).toBe(380000n);
    expect(lancha?.promoHasta?.toISOString().slice(0, 10)).toBe('2027-01-31');
    expect(lancha?.opcionDeSalidaId).toBe(
      fila.opcionesDeSalida.find((o) => o.etiqueta === 'Lancha')?.id,
    );

    const lista = await llamar(TENANT_A, 'GET', '/api/v1/paquetes');
    const p = (lista.json['datos'] as Record<string, unknown>[]).find((x) => x['id'] === paqueteId);
    expect(p).toMatchObject({
      codigo: 'E2E-ISLA-PALMA',
      formato: { id: formatoId, nombre: 'Pasadía e2e' },
      cargosEnDestino: [
        { concepto: 'Tasa portuaria', monto: { unidades: '29000', moneda: 'COP' } },
      ],
      camposPersonalizados: { restricciones: 'Mayores de 4 años' },
    });
    const opciones = p?.['opcionesDeSalida'] as { etiqueta: string; horaSalida: string | null }[];
    expect(opciones.map((o) => [o.etiqueta, o.horaSalida])).toEqual([
      ['Lancha', '07:30'],
      ['Terrestre', null],
    ]);
  });

  it('aplicar la misma propuesta otra vez no cambia nada (idempotente)', async () => {
    const aplicador = app.get(AplicadorDeCatalogo);
    const antes = await admin.registroAuditoria.count({ where: { tenantId: TENANT_A } });
    const r = await comoTenant(TENANT_A, () =>
      aplicador.aplicar(isla(), {
        tenantId: TENANT_A,
        usuarioId: USUARIO_A,
        permisos: ['catalogo.administrar'],
      }),
    );
    expect(r.informe.resumen).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 1 });
    expect(await admin.registroAuditoria.count({ where: { tenantId: TENANT_A } })).toBe(antes);
  });

  it('un cambio solo en los cargos en destino sí se aplica', async () => {
    const aplicador = app.get(AplicadorDeCatalogo);
    const p = isla();
    p.productos[0]!.cargosEnDestino = [
      {
        concepto: 'Tasa portuaria',
        monto: { unidades: '31000', moneda: 'COP' },
        unidad: 'POR_PERSONA',
      },
    ];
    const r = await comoTenant(TENANT_A, () =>
      aplicador.aplicar(p, {
        tenantId: TENANT_A,
        usuarioId: USUARIO_A,
        permisos: ['catalogo.administrar'],
      }),
    );
    expect(r.informe.resumen.actualizados).toBe(1);
    const fila = await admin.paquete.findFirstOrThrow({ where: { id: paqueteId } });
    expect(fila.cargosEnDestino).toEqual([
      {
        concepto: 'Tasa portuaria',
        monto: { unidades: '31000', moneda: 'COP' },
        unidad: 'POR_PERSONA',
      },
    ]);
    // Se restablece el monto del escenario para las pruebas de cotización.
    await comoTenant(TENANT_A, () =>
      aplicador.aplicar(isla(), {
        tenantId: TENANT_A,
        usuarioId: USUARIO_A,
        permisos: ['catalogo.administrar'],
      }),
    );
  });

  it.each([
    ['sin definición', { inventado: 'x' }],
    ['de tipo inválido', { restricciones: 123 }],
    ['con una opción fuera de la lista', { nivel: 'medio' }],
  ])('un campo personalizado %s rechaza toda la propuesta', async (_caso, campos) => {
    const aplicador = app.get(AplicadorDeCatalogo);
    const p = isla();
    p.productos[0]!.codigo = 'E2E-INVALIDO';
    p.productos[0]!.nombre = 'Producto inválido';
    p.productos[0]!.camposPersonalizados = campos;
    await expect(
      comoTenant(TENANT_A, () =>
        aplicador.aplicar(p, {
          tenantId: TENANT_A,
          usuarioId: USUARIO_A,
          permisos: ['catalogo.administrar'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROPUESTA_INVALIDA' });
    expect(
      await admin.paquete.count({ where: { tenantId: TENANT_A, codigo: 'E2E-INVALIDO' } }),
    ).toBe(0);
  });

  it('un formato desconocido rechaza la propuesta', async () => {
    const aplicador = app.get(AplicadorDeCatalogo);
    const p = isla();
    p.productos[0]!.codigo = 'E2E-SIN-FORMATO';
    p.productos[0]!.formato = 'No existe';
    await expect(
      comoTenant(TENANT_A, () =>
        aplicador.aplicar(p, {
          tenantId: TENANT_A,
          usuarioId: USUARIO_A,
          permisos: ['catalogo.administrar'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROPUESTA_INVALIDA' });
  });

  describe('cotización', () => {
    const cotizar = (tenantId: string, extra: Record<string, unknown> = {}) =>
      llamar(tenantId, 'POST', '/api/v1/catalogo/cotizar', {
        paqueteId,
        fecha: '2027-02-10',
        adultos: 2,
        ...extra,
      });

    it('sin opción de salida responde OPCION_DE_SALIDA_REQUERIDA (422)', async () => {
      const r = await cotizar(TENANT_A);
      expect(r.estado).toBe(422);
      expect(codigoDeError(r.json)).toBe('OPCION_DE_SALIDA_REQUERIDA');
    });

    it('con Lancha usa solo su tarifa y los cargos en destino van aparte, fuera del total', async () => {
      const opcion = await admin.opcionDeSalida.findFirstOrThrow({
        where: { paqueteId, etiqueta: 'Lancha' },
      });
      const r = await cotizar(TENANT_A, { opcionDeSalidaId: opcion.id });
      expect(r.estado).toBe(200);
      expect(r.json['total']).toEqual({ unidades: '640000', moneda: 'COP' });
      expect((r.json['lineas'] as { nombre: string }[]).map((l) => l.nombre)).toEqual([
        'Adulto lancha',
      ]);
      expect(r.json['opcionDeSalida']).toEqual({ id: opcion.id, etiqueta: 'Lancha' });
      expect(r.json['cargosEnDestino']).toEqual([
        {
          concepto: 'Tasa portuaria',
          monto: { unidades: '29000', moneda: 'COP' },
          unidad: 'POR_PERSONA',
          nota: 'Se paga en el muelle',
        },
      ]);
    });

    it('con Terrestre usa la tarifa terrestre', async () => {
      const opcion = await admin.opcionDeSalida.findFirstOrThrow({
        where: { paqueteId, etiqueta: 'Terrestre' },
      });
      const r = await cotizar(TENANT_A, { opcionDeSalidaId: opcion.id });
      expect(r.json['total']).toEqual({ unidades: '500000', moneda: 'COP' });
    });

    it('la cotización guardada conserva la opción elegida y, recotizada con ella, da el mismo total (T-062)', async () => {
      const opcion = await admin.opcionDeSalida.findFirstOrThrow({
        where: { paqueteId, etiqueta: 'Lancha' },
      });
      const contacto = await admin.contacto.create({
        data: {
          tenantId: TENANT_A,
          telefonoE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
          nombre: 'Viajero de la lancha',
        },
      });

      const guardada = await llamar(TENANT_A, 'POST', '/api/v1/cotizaciones', {
        contactoId: contacto.id,
        titulo: 'Isla Palma en lancha',
        version: { paqueteId, fecha: '2027-02-10', adultos: 2, opcionDeSalidaId: opcion.id },
      });
      expect(guardada.estado).toBe(201);
      const id = guardada.json['id'] as string;

      const leida = await llamar(TENANT_A, 'GET', `/api/v1/cotizaciones/${id}`);
      expect(leida.estado).toBe(200);
      const [v1] = leida.json['versiones'] as Array<{
        opcionDeSalidaId: string | null;
        venta: unknown;
      }>;
      expect(v1?.opcionDeSalidaId).toBe(opcion.id);
      expect(v1?.venta).toEqual({ unidades: '640000', moneda: 'COP' });

      // Recotizar con lo que devolvió la lectura reproduce el total guardado.
      const otra = await cotizar(TENANT_A, { opcionDeSalidaId: v1?.opcionDeSalidaId });
      expect(otra.json['total']).toEqual(v1?.venta);

      // Y el tenant B no la lee.
      const ajena = await llamar(TENANT_B, 'GET', `/api/v1/cotizaciones/${id}`);
      expect(ajena.estado).toBe(404);
    });

    it('una opción inexistente es 404', async () => {
      const r = await cotizar(TENANT_A, { opcionDeSalidaId: randomUUID() });
      expect(r.estado).toBe(404);
      expect(codigoDeError(r.json)).toBe('OPCION_DE_SALIDA_NO_ENCONTRADO');
    });

    it('el tenant B no puede cotizar el paquete de A ni usar su opción (404)', async () => {
      const opcion = await admin.opcionDeSalida.findFirstOrThrow({ where: { paqueteId } });
      const r = await cotizar(TENANT_B, { opcionDeSalidaId: opcion.id });
      expect(r.estado).toBe(404);
    });
  });
});

describe('compatibilidad: paquetes sin campos nuevos', () => {
  it('un paquete sin opciones ni cargos cotiza igual que antes', async () => {
    const aplicador = app.get(AplicadorDeCatalogo);
    const r = await comoTenant(TENANT_A, () =>
      aplicador.aplicar(
        {
          version: 1,
          origen: 'API',
          productos: [
            {
              codigo: 'E2E-SIMPLE',
              nombre: 'Tour simple',
              destino: 'Cartagena',
              dias: 1,
              noches: 0,
              vigencias: [
                {
                  desde: '2027-02-01',
                  hasta: '2027-02-28',
                  publicada: false,
                  tarifas: [tarifa('Adulto', '100000')],
                },
              ],
            },
          ],
        },
        { tenantId: TENANT_A, usuarioId: USUARIO_A, permisos: ['catalogo.administrar'] },
      ),
    );
    const id = r.paquetes[0]?.id ?? '';
    const c = await llamar(TENANT_A, 'POST', '/api/v1/catalogo/cotizar', {
      paqueteId: id,
      fecha: '2027-02-10',
      adultos: 2,
    });
    expect(c.estado).toBe(200);
    expect(c.json['total']).toEqual({ unidades: '200000', moneda: 'COP' });
    expect(c.json['cargosEnDestino']).toEqual([]);
    expect(c.json['opcionDeSalida']).toBeNull();
  });

  it('el tenant B no ve ningún paquete de A en el listado', async () => {
    const lista = await llamar(TENANT_B, 'GET', '/api/v1/paquetes');
    expect(lista.json['datos']).toEqual([]);
  });
});
