/**
 * e2e de T-122: `GET /api/v1/canales/whatsapp/estado` contra la aplicación ensamblada, con DOS
 * agencias de fixture. Afirma:
 *   · cada agencia ve solo sus números (el de la otra no aparece);
 *   · última recepción y último envío fallido salen de SUS mensajes, no de los de la otra agencia;
 *   · una agencia sin números responde `conectado: false` y lista vacía;
 *   · la respuesta no contiene tokens, secretos ni el texto de los mensajes (R6, R10);
 *   · una cuenta suspendida no cuenta como conectada.
 * Necesita Postgres migrado (`DATABASE_URL`) y `APP_ENV=local` (atajo `x-dev-tenant-id`), igual
 * que `crm.e2e-spec.ts`. Solo corre en CI.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { EstadoCanalWhatsapp } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const TENANT_VACIO = idDeTenant();
const TOKEN_SECRETO = 'EAAG-token-secreto-de-prueba';
const TEXTO_PRIVADO = 'mi pasaporte es AB123456';
const numero = (): string => `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`;
const NUMERO_A = numero();
const NUMERO_B = numero();

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
const tenantsCreados = [TENANT_A, TENANT_B, TENANT_VACIO];

async function agencia(
  id: string,
  etiqueta: string,
  opciones: { numero?: string; estadoCuenta?: 'ACTIVO' | 'SUSPENDIDO' } = {},
): Promise<{ canalId: string } | null> {
  await admin.tenant.create({
    data: {
      id,
      slug: `fixture-estado-canal-${etiqueta}-${id.slice(-8)}`,
      nombre: `Agencia ${etiqueta}`,
    },
  });
  if (!opciones.numero) return null;
  const cuenta = await admin.cuentaWhatsapp.create({
    data: {
      tenantId: id,
      wabaId: `waba-ec-${randomBytes(4).toString('hex')}`,
      estado: opciones.estadoCuenta ?? 'ACTIVO',
      tokenCifrado: Buffer.from(TOKEN_SECRETO),
      tokenNonce: Buffer.from('nonce-de-prueba'),
      tokenTag: Buffer.from('tag-de-prueba'),
      claveVersion: 1,
    },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId: id,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: opciones.numero,
    },
  });
  return { canalId: canal.id };
}

async function mensaje(
  tenantId: string,
  canalId: string,
  datos: {
    direccion: 'ENTRANTE' | 'SALIENTE';
    estado: 'ENTREGADO' | 'FALLIDO';
    ocurridoEn: Date;
    motivo?: string;
    codigo?: number;
  },
): Promise<void> {
  const contacto = await admin.contacto.create({
    data: { tenantId, telefonoE164: numero(), nombre: 'Viajero' },
  });
  const conv = await admin.conversacion.create({
    data: {
      tenantId,
      canalId,
      contactoId: contacto.id,
      ultimoMensajeEn: datos.ocurridoEn,
      ultimoMensajeDireccion: datos.direccion,
    },
  });
  await admin.mensaje.create({
    data: {
      tenantId,
      conversacionId: conv.id,
      direccion: datos.direccion,
      tipo: 'TEXTO',
      estado: datos.estado,
      texto: TEXTO_PRIVADO,
      wamid: `wamid.ec.${randomBytes(6).toString('hex')}`,
      ocurridoEn: datos.ocurridoEn,
      motivoFallo: datos.motivo ?? null,
      codigoErrorMeta: datos.codigo ?? null,
    },
  });
}

const estadoDe = async (tenant: string): Promise<{ status: number; texto: string }> => {
  const r = await fetch(new URL('/api/v1/canales/whatsapp/estado', base), {
    headers: { 'x-dev-tenant-id': tenant },
  });
  return { status: r.status, texto: await r.text() };
};

const parsear = (texto: string): EstadoCanalWhatsapp => JSON.parse(texto) as EstadoCanalWhatsapp;

const HACE_2_DIAS = new Date(Date.now() - 2 * 24 * 3600_000);
const HACE_1_HORA = new Date(Date.now() - 3600_000);

beforeAll(async () => {
  process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ??= 'token-solo-de-esta-prueba';
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  const a = await agencia(TENANT_A, 'a', { numero: NUMERO_A });
  const b = await agencia(TENANT_B, 'b', { numero: NUMERO_B, estadoCuenta: 'SUSPENDIDO' });
  await agencia(TENANT_VACIO, 'vacia');
  if (!a || !b) throw new Error('Fixture incompleto');

  // A: dos entrantes (cuenta el más reciente) y dos fallos (cuenta el más reciente).
  await mensaje(TENANT_A, a.canalId, {
    direccion: 'ENTRANTE',
    estado: 'ENTREGADO',
    ocurridoEn: HACE_2_DIAS,
  });
  await mensaje(TENANT_A, a.canalId, {
    direccion: 'ENTRANTE',
    estado: 'ENTREGADO',
    ocurridoEn: HACE_1_HORA,
  });
  await mensaje(TENANT_A, a.canalId, {
    direccion: 'SALIENTE',
    estado: 'FALLIDO',
    ocurridoEn: HACE_2_DIAS,
    motivo: 'Fallo viejo',
    codigo: 131026,
  });
  await mensaje(TENANT_A, a.canalId, {
    direccion: 'SALIENTE',
    estado: 'FALLIDO',
    ocurridoEn: HACE_1_HORA,
    motivo: 'Pasaron más de 24 horas desde el último mensaje del cliente.',
    codigo: 131047,
  });
  // Un saliente entregado NO es un fallo.
  await mensaje(TENANT_A, a.canalId, {
    direccion: 'SALIENTE',
    estado: 'ENTREGADO',
    ocurridoEn: new Date(),
  });
  // B: actividad propia, más reciente que la de A, que A no debe ver.
  await mensaje(TENANT_B, b.canalId, {
    direccion: 'ENTRANTE',
    estado: 'ENTREGADO',
    ocurridoEn: new Date(),
  });

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
}, 60_000);

afterAll(async () => {
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, tenantsCreados);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('estado del canal de WhatsApp (T-122)', () => {
  it('A ve solo su número, su última recepción y su último fallo', async () => {
    const r = await estadoDe(TENANT_A);
    expect(r.status).toBe(200);
    const e = parsear(r.texto);
    expect(e.conectado).toBe(true);
    expect(e.canales).toHaveLength(1);
    const canal = e.canales[0];
    expect(canal?.numeroE164).toBe(NUMERO_A);
    expect(canal?.conectado).toBe(true);
    expect(new Date(canal?.ultimaRecepcionEn ?? 0).getTime()).toBe(HACE_1_HORA.getTime());
    expect(canal?.ultimoEnvioFallido).toEqual({
      ocurridoEn: HACE_1_HORA.toISOString(),
      motivo: 'Pasaron más de 24 horas desde el último mensaje del cliente.',
      codigoErrorMeta: 131047,
    });
    expect(r.texto).not.toContain(NUMERO_B);
  });

  it('B ve el suyo; con la cuenta suspendida no está conectada y no hereda nada de A', async () => {
    const r = await estadoDe(TENANT_B);
    const e = parsear(r.texto);
    expect(e.conectado).toBe(false);
    expect(e.canales).toHaveLength(1);
    expect(e.canales[0]).toMatchObject({
      numeroE164: NUMERO_B,
      estado: 'ACTIVO',
      estadoCuenta: 'SUSPENDIDO',
      conectado: false,
      ultimoEnvioFallido: null,
    });
    expect(r.texto).not.toContain(NUMERO_A);
    expect(r.texto).not.toContain('131047');
  });

  it('una agencia sin números responde conectado:false y lista vacía', async () => {
    const e = parsear((await estadoDe(TENANT_VACIO)).texto);
    expect(e).toEqual({ conectado: false, canales: [] });
  });

  it('no filtra tokens, columnas de cifrado ni el texto de los mensajes', async () => {
    for (const t of [TENANT_A, TENANT_B]) {
      const { texto } = await estadoDe(t);
      expect(texto).not.toContain(TOKEN_SECRETO);
      expect(texto).not.toContain(TEXTO_PRIVADO);
      expect(texto).not.toMatch(/token|nonce|tag|claveVersion|cifrado|wabaId|phoneNumberId/i);
    }
  });
});
