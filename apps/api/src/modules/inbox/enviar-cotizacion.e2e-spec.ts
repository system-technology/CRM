/**
 * Enviar una cotización por WhatsApp (T-073), de punta a punta: HTTP real, PostgreSQL con RLS.
 *
 *   POST /api/v1/conversaciones/:id/cotizaciones   { cotizacionId, version? }
 *
 * Afirma: el mensaje queda `PENDIENTE` con el texto armado y `cotizacion_id`; repetir el envío
 * devuelve el MISMO mensaje (clave derivada); fuera de la ventana de 24 h responde 409
 * `VENTANA_CERRADA` y no guarda nada; una cotización de otro contacto es 422; una cotización de
 * otra agencia es 404. Fixtures propios (prefijo `fixture-aislamiento-`), borrados al terminar.
 *
 * NO verificada en la sesión que la escribió: necesita Postgres (Neon) y no había acceso.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { CotizacionGuardada, Mensaje } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const FECHA = '2027-03-15';

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let convAbierta: string;
let convCerrada: string;
let convOtroContacto: string;
let cotizacionA: string;
let cotizacionB: string;
let cotizacionCerrada: string;

interface Cuerpo extends Partial<Mensaje> {
  error?: { code: string };
}

async function post(tenant: string, ruta: string, cuerpo: unknown) {
  const r = await fetch(new URL(ruta, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-tenant-id': tenant },
    body: JSON.stringify(cuerpo),
  });
  return { estado: r.status, json: (await r.json()) as Cuerpo };
}

const telefono = (): string => `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`;

async function agencia(tenant: string, sufijo: string): Promise<{ canalId: string }> {
  await admin.tenant.create({
    data: {
      id: tenant,
      slug: `fixture-aislamiento-envcot-${tenant.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
    },
  });
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId: tenant, wabaId: `waba-cot-${randomBytes(4).toString('hex')}`, nombre: 'W' },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId: tenant,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: telefono(),
    },
  });
  return { canalId: canal.id };
}

async function conversacion(tenant: string, canalId: string, clienteHaceMs: number) {
  const contacto = await admin.contacto.create({
    data: { tenantId: tenant, telefonoE164: telefono(), nombre: 'Viajero' },
  });
  const cuando = new Date(Date.now() - clienteHaceMs);
  const c = await admin.conversacion.create({
    data: {
      tenantId: tenant,
      canalId,
      contactoId: contacto.id,
      ultimoMensajeClienteEn: cuando,
      ultimoMensajeEn: cuando,
      ultimoMensajeTexto: 'hola',
      ultimoMensajeDireccion: 'ENTRANTE',
    },
  });
  return { id: c.id, contactoId: contacto.id };
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  const a = await agencia(TENANT_A, 'A');
  await agencia(TENANT_B, 'B');
  const abierta = await conversacion(TENANT_A, a.canalId, 0);
  const cerrada = await conversacion(TENANT_A, a.canalId, 25 * 3_600_000);
  const otro = await conversacion(TENANT_A, a.canalId, 0);
  convAbierta = abierta.id;
  convCerrada = cerrada.id;
  convOtroContacto = otro.id;

  const paquete = await admin.paquete.create({
    data: {
      tenantId: TENANT_A,
      nombre: 'San Andrés fixture',
      destino: 'San Andrés',
      dias: 4,
      noches: 3,
      planAlimentacion: 'TODO_INCLUIDO',
      cargosEnDestino: [
        {
          concepto: 'Tasa de turismo',
          monto: { unidades: '120000', moneda: 'COP' },
          unidad: 'POR_PERSONA',
        },
      ],
    },
  });
  const vigencia = await admin.vigencia.create({
    data: {
      tenantId: TENANT_A,
      paqueteId: paquete.id,
      desde: new Date('2027-03-01'),
      hasta: new Date('2027-03-31'),
    },
  });
  await admin.tarifa.create({
    data: {
      tenantId: TENANT_A,
      vigenciaId: vigencia.id,
      nombre: 'Adulto',
      netoUnidades: 1_000_000n,
      ventaUnidades: 1_200_000n,
      monedaIso: 'COP',
    },
  });

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();

  // Las cotizaciones se crean por la API: el servidor recalcula y congela la versión 1.
  const guardar = async (tenant: string, contactoId: string, paqueteId: string) => {
    const r = await post(tenant, '/api/v1/cotizaciones', {
      contactoId,
      titulo: 'Para dos',
      version: { paqueteId, fecha: FECHA, adultos: 2 },
    });
    return (r.json as unknown as CotizacionGuardada).id;
  };
  cotizacionA = await guardar(TENANT_A, abierta.contactoId, paquete.id);
  // Una cotización de la agencia B no puede salir de la agencia A.
  const contactoB = await admin.contacto.create({
    data: { tenantId: TENANT_B, telefonoE164: telefono(), nombre: 'B' },
  });
  const paqueteB = await admin.paquete.create({
    data: {
      tenantId: TENANT_B,
      nombre: 'Paquete B',
      destino: 'Cartagena',
      dias: 3,
      noches: 2,
      planAlimentacion: 'TODO_INCLUIDO',
    },
  });
  const vigB = await admin.vigencia.create({
    data: {
      tenantId: TENANT_B,
      paqueteId: paqueteB.id,
      desde: new Date('2027-03-01'),
      hasta: new Date('2027-03-31'),
    },
  });
  await admin.tarifa.create({
    data: {
      tenantId: TENANT_B,
      vigenciaId: vigB.id,
      nombre: 'Adulto',
      netoUnidades: 1n,
      ventaUnidades: 2n,
      monedaIso: 'COP',
    },
  });
  cotizacionB = await guardar(TENANT_B, contactoB.id, paqueteB.id);
  // La conversación cerrada es de otro contacto: su cotización propia, para que la ventana (409)
  // sea lo único que falle y no el contacto (422).
  cotizacionCerrada = await guardar(TENANT_A, cerrada.contactoId, paquete.id);
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

describe('enviar cotización por WhatsApp', () => {
  it('guarda un mensaje PENDIENTE con el texto armado y la cotización', async () => {
    const r = await post(TENANT_A, `/api/v1/conversaciones/${convAbierta}/cotizaciones`, {
      cotizacionId: cotizacionA,
    });
    expect(r.estado).toBe(201);
    expect(r.json.estado).toBe('PENDIENTE');
    expect(r.json.cotizacionId).toBe(cotizacionA);
    expect(r.json.texto).toContain('*Total: $ 2.400.000 COP*');
    expect(r.json.texto).toContain('*No incluido (se paga en destino)*');
    expect(r.json.texto).toContain('Tasa de turismo: $ 120.000 por persona');
    expect(r.json.texto).not.toMatch(/neto|margen/i);
  });

  it('repetir el envío devuelve el mismo mensaje (R5)', async () => {
    const ruta = `/api/v1/conversaciones/${convAbierta}/cotizaciones`;
    const a = await post(TENANT_A, ruta, { cotizacionId: cotizacionA, version: 1 });
    const b = await post(TENANT_A, ruta, { cotizacionId: cotizacionA });
    expect(a.json.id).toBeDefined();
    expect(b.json.id).toBe(a.json.id);
    const n = await admin.mensaje.count({
      where: { conversacionId: convAbierta, cotizacionId: cotizacionA },
    });
    expect(n).toBe(1);
  });

  it('fuera de la ventana de 24 h: 409 VENTANA_CERRADA y no guarda nada', async () => {
    const r = await post(TENANT_A, `/api/v1/conversaciones/${convCerrada}/cotizaciones`, {
      cotizacionId: cotizacionCerrada,
    });
    expect(r.estado).toBe(409);
    expect(r.json.error?.code).toBe('VENTANA_CERRADA');
    expect(await admin.mensaje.count({ where: { conversacionId: convCerrada } })).toBe(0);
  });

  it('una cotización de otro contacto no sale a esta conversación: 422', async () => {
    const r = await post(TENANT_A, `/api/v1/conversaciones/${convOtroContacto}/cotizaciones`, {
      cotizacionId: cotizacionA,
    });
    expect(r.estado).toBe(422);
    expect(r.json.error?.code).toBe('COTIZACION_DE_OTRO_CONTACTO');
  });

  it('una cotización de otra agencia es 404, igual que una inexistente', async () => {
    const r = await post(TENANT_A, `/api/v1/conversaciones/${convAbierta}/cotizaciones`, {
      cotizacionId: cotizacionB,
    });
    expect(r.estado).toBe(404);
  });

  it('rechaza un cuerpo con texto o importes (el servidor arma el mensaje): 400', async () => {
    const r = await post(TENANT_A, `/api/v1/conversaciones/${convAbierta}/cotizaciones`, {
      cotizacionId: cotizacionA,
      texto: 'precio manipulado',
    });
    expect(r.estado).toBe(400);
  });
});
