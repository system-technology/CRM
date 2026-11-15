/**
 * T-187: la primera respuesta de /reportes mide UN solo grupo, las conversaciones creadas en el
 * rango. Contra PostgreSQL con RLS, con el adaptador de `inbox` ejecutado bajo `ContextoTenant`.
 *
 * Agencia A (rango = últimas 48 h):
 *   · c1  creada hoy, entrante hace 2 h, respondida a los 10 min   → respondida
 *   · c2  creada hoy, entrante hace 2 h, respondida a los 30 min   → respondida
 *   · c3  creada hoy, entrante, sin respuesta                       → sin responder
 *   · c4  creada hoy, la abrió el asesor (sin entrante), con respuesta → fuera del grupo
 *   · c5  creada hace 10 días, con primera respuesta HOY            → fuera del grupo (antes inflaba
 *         el numerador: «X de Y» con X > Y)
 * Agencia B tiene una conversación respondida: no debe aparecer en las cifras de A.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { RespuestaParaReportesPrisma } from '../inbox/infrastructure/respuesta-para-reportes.prisma.js';
import { mensajeConTexto } from '../../shared/cifrado/cifrado-de-prueba.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const HORA = 3600_000;
const MIN = 60_000;

let app: Awaited<ReturnType<typeof NestFactory.create>>;
let admin: PrismaClient;
let adminPg: Client;
let adaptador: RespuestaParaReportesPrisma;

const rango = () => ({
  desde: new Date(Date.now() - 48 * HORA),
  hasta: new Date(Date.now() + HORA),
});

async function agencia(tenant: string, sufijo: string) {
  await admin.tenant.create({
    data: {
      id: tenant,
      slug: `fixture-aislamiento-resp-${tenant.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
    },
  });
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId: tenant, wabaId: `waba-resp-${randomBytes(4).toString('hex')}` },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId: tenant,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  return canal.id;
}

async function conversacion(
  tenant: string,
  canalId: string,
  opciones: {
    creadaHace: number;
    entranteEn?: Date;
    primeraRespuestaEn?: Date;
  },
): Promise<void> {
  const contacto = await admin.contacto.create({
    data: {
      tenantId: tenant,
      telefonoE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: 'Viajero fixture',
    },
  });
  const c = await admin.conversacion.create({
    data: {
      tenantId: tenant,
      canalId,
      contactoId: contacto.id,
      creadoEn: new Date(Date.now() - opciones.creadaHace),
      ...(opciones.primeraRespuestaEn ? { primeraRespuestaEn: opciones.primeraRespuestaEn } : {}),
    },
  });
  if (opciones.entranteEn) {
    await admin.mensaje.create({
      data: {
        tenantId: tenant,
        conversacionId: c.id,
        direccion: 'ENTRANTE',
        tipo: 'TEXTO',
        estado: 'ENTREGADO',
        ...mensajeConTexto(tenant, 'Hola'),
        wamid: `wamid.resp.${randomBytes(6).toString('hex')}`,
        ocurridoEn: opciones.entranteEn,
      },
    });
  }
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  const canalA = await agencia(TENANT_A, 'A');
  const canalB = await agencia(TENANT_B, 'B');
  const hace2h = new Date(Date.now() - 2 * HORA);
  const resp = (min: number) => new Date(hace2h.getTime() + min * MIN);

  await conversacion(TENANT_A, canalA, {
    creadaHace: 3 * HORA,
    entranteEn: hace2h,
    primeraRespuestaEn: resp(10),
  });
  await conversacion(TENANT_A, canalA, {
    creadaHace: 3 * HORA,
    entranteEn: hace2h,
    primeraRespuestaEn: resp(30),
  });
  await conversacion(TENANT_A, canalA, { creadaHace: 3 * HORA, entranteEn: hace2h });
  await conversacion(TENANT_A, canalA, { creadaHace: 3 * HORA, primeraRespuestaEn: resp(5) });
  await conversacion(TENANT_A, canalA, {
    creadaHace: 10 * 24 * HORA,
    entranteEn: new Date(Date.now() - 10 * 24 * HORA),
    primeraRespuestaEn: new Date(),
  });
  await conversacion(TENANT_B, canalB, {
    creadaHace: 3 * HORA,
    entranteEn: hace2h,
    primeraRespuestaEn: resp(90),
  });

  Logger.overrideLogger(false);
  // `create` y no `createApplicationContext`: el gateway de la bandeja en vivo necesita el
  // servidor HTTP al arrancar. No hace falta escuchar: la prueba usa el adaptador directo.
  app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  adaptador = new RespuestaParaReportesPrisma(app.get(PrismaService));
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

const comoTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
  ContextoTenant.ejecutarCon(
    {
      tenantId,
      usuarioId: null,
      identidadId: null,
      permisos: new Set(),
      trazaId: 'e2e-respuesta',
    },
    fn,
  );

describe('primera respuesta de reportes: un solo grupo (T-187)', () => {
  it('numerador y denominador salen de las conversaciones creadas en el rango', async () => {
    const r = await comoTenant(TENANT_A, () => adaptador.resumir(TENANT_A, rango()));
    // c1, c2, c3: c4 (la abrió el asesor) y c5 (creada fuera del rango) no son del grupo.
    expect(r.conversacionesNuevas).toBe(3);
    expect(r.conversacionesRespondidas).toBe(2);
    expect(r.sinResponder).toBe(1);
    expect(r.conversacionesRespondidas).toBeLessThanOrEqual(r.conversacionesNuevas);
  });

  it('mediana, promedio y p90 son del grupo respondido (percentile_cont)', async () => {
    const r = await comoTenant(TENANT_A, () => adaptador.resumir(TENANT_A, rango()));
    // Tiempos: 10 y 30 min. Mediana 20, promedio 20, p90 = 10 + 0.9 * 20 = 28.
    expect(r.medianaMinutos).toBe(20);
    expect(r.promedioMinutos).toBe(20);
    expect(r.p90Minutos).toBe(28);
  });

  it('no mezcla agencias: B no entra en las cifras de A, y a la inversa', async () => {
    const b = await comoTenant(TENANT_B, () => adaptador.resumir(TENANT_B, rango()));
    expect(b).toMatchObject({
      conversacionesNuevas: 1,
      conversacionesRespondidas: 1,
      sinResponder: 0,
      medianaMinutos: 90,
      p90Minutos: 90,
    });
    // Con el contexto de B pero pidiendo el id de A, RLS no devuelve filas de A.
    const cruzado = await comoTenant(TENANT_B, () => adaptador.resumir(TENANT_A, rango()));
    expect(cruzado.conversacionesNuevas).toBe(0);
  });

  it('un rango sin conversaciones: ceros y tiempos null', async () => {
    const r = await comoTenant(TENANT_A, () =>
      adaptador.resumir(TENANT_A, {
        desde: new Date(Date.now() - 300 * 24 * HORA),
        hasta: new Date(Date.now() - 200 * 24 * HORA),
      }),
    );
    expect(r).toEqual({
      conversacionesNuevas: 0,
      conversacionesRespondidas: 0,
      sinResponder: 0,
      promedioMinutos: null,
      medianaMinutos: null,
      p90Minutos: null,
    });
  });
});
