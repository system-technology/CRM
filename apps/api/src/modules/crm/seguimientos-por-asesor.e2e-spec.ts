/**
 * H2 (D3: «el asesor ve lo suyo, el administrador todo»): `?asesorId=` en
 * `GET /crm/seguimientos` y `GET /crm/seguimientos/pendientes-del-dia`, de punta a punta con
 * sesiones reales, HTTP real y PostgreSQL con RLS.
 *
 * Agencia A: `dueno` (con `conversaciones.ver_todas`), `ana` y `beto` (asesores, sin él).
 * Agencia B: `bruno` (con `ver_todas`), para comprobar que el aislamiento entre agencias sigue.
 * Cada asesor de A tiene un seguimiento vencido; B tiene uno propio.
 *
 * **T-342 cambió el cierre provisional de #395**: sin `conversaciones.ver_todas`, pedir el
 * `asesorId` de OTRO ya no se ignora en silencio, responde 403 (ADR-0035 §4). Lo que no cambia es
 * que el asesor nunca ve lo ajeno, ni dentro de su agencia ni fuera.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const DOMINIO = '@fixture-identidad.test';
type Persona = 'dueno' | 'ana' | 'beto' | 'bruno';
const PERSONAS: Persona[] = ['dueno', 'ana', 'beto', 'bruno'];
const sufijo = randomBytes(3).toString('hex');
const correo = (p: Persona): string => `fixture-seg-asesor-${sufijo}-${p}${DOMINIO}`;
const identidades: string[] = [];
const U = {} as Record<Persona, string>;
const cookies = {} as Record<Persona, string>;
const seguimientoDe = {} as Record<Persona, string>;

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;

const rnd = (): number => Math.floor(Math.random() * 250) + 1;

interface Respuesta {
  status: number;
  json: Record<string, unknown>;
}

async function get(quien: Persona, ruta: string): Promise<Respuesta> {
  const r = await fetch(new URL(ruta, base), {
    headers: { cookie: cookies[quien], 'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}` },
  });
  const texto = await r.text();
  return { status: r.status, json: texto ? (JSON.parse(texto) as Respuesta['json']) : {} };
}

async function iniciarSesion(quien: Persona): Promise<string> {
  const r = await fetch(new URL('/api/v1/auth/sign-in/email', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    body: JSON.stringify({ correo: correo(quien), contrasena: CLAVE }),
  });
  expect(r.status).toBe(200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function persona(quien: Persona, tenantId: string, rolId: string): Promise<void> {
  const i = await admin.identidad.create({
    data: { correo: correo(quien), nombre: quien, correoVerificado: true },
  });
  identidades.push(i.id);
  await admin.credencial.create({
    data: {
      identidadId: i.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  const u = await admin.usuario.create({
    data: { tenantId, identidadId: i.id, rolId, correo: correo(quien), nombre: quien },
  });
  U[quien] = u.id;
}

const canalDe = new Map<string, string>();

/** Un seguimiento cuelga de una conversación o de una oportunidad (CHECK de la tabla): usamos la conversación. */
async function canalDeLaAgencia(tenantId: string): Promise<string> {
  const existente = canalDe.get(tenantId);
  if (existente) return existente;
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId, wabaId: `waba-seg-${randomBytes(4).toString('hex')}`, nombre: 'WABA' },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  canalDe.set(tenantId, canal.id);
  return canal.id;
}

async function seguimiento(tenantId: string, quien: Persona): Promise<string> {
  const contacto = await admin.contacto.create({
    data: {
      tenantId,
      telefonoE164: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: `Viajero ${quien}`,
    },
  });
  const conversacion = await admin.conversacion.create({
    data: { tenantId, contactoId: contacto.id, canalId: await canalDeLaAgencia(tenantId) },
  });
  const s = await admin.seguimiento.create({
    data: {
      tenantId,
      descripcion: `Llamar de parte de ${quien}`,
      venceEn: new Date(Date.now() - 3 * 24 * 3600_000),
      asesorId: U[quien],
      contactoId: contacto.id,
      conversacionId: conversacion.id,
    },
  });
  return s.id;
}

const ids = (r: Respuesta): string[] =>
  ((r.json['datos'] as Array<{ id: string }> | undefined) ?? []).map((s) => s.id);
const idsDelDia = (r: Respuesta): string[] =>
  [...(r.json['vencidos'] as Array<{ id: string }>), ...(r.json['deHoy'] as Array<{ id: string }>)]
    .map((s) => s.id)
    .sort();

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  for (const [id, n] of [
    [TENANT_A, 'A'],
    [TENANT_B, 'B'],
  ] as const) {
    await admin.tenant.create({
      data: { id, slug: `fixture-seg-asesor-${id.slice(-12)}`, nombre: `Agencia ${n}` },
    });
  }
  const rolDueno = await admin.rol.create({
    data: {
      tenantId: TENANT_A,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['conversaciones.ver_todas', 'crm.escribir'],
    },
  });
  const rolAsesor = await admin.rol.create({
    data: { tenantId: TENANT_A, nombre: 'Asesor', clave: 'ASESOR', permisos: ['crm.escribir'] },
  });
  const rolB = await admin.rol.create({
    data: {
      tenantId: TENANT_B,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['conversaciones.ver_todas', 'crm.escribir'],
    },
  });
  await persona('dueno', TENANT_A, rolDueno.id);
  await persona('ana', TENANT_A, rolAsesor.id);
  await persona('beto', TENANT_A, rolAsesor.id);
  await persona('bruno', TENANT_B, rolB.id);
  seguimientoDe.ana = await seguimiento(TENANT_A, 'ana');
  seguimientoDe.beto = await seguimiento(TENANT_A, 'beto');
  seguimientoDe.bruno = await seguimiento(TENANT_B, 'bruno');

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
  for (const p of PERSONAS) cookies[p] = await iniciarSesion(p);
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
      await adminPg.query('DELETE FROM identidades WHERE id = ANY($1::uuid[])', [identidades]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('GET /crm/seguimientos?asesorId= (H2, T-342)', () => {
  it('un asesor sin ver_todas pidiendo el asesorId de otro recibe 403, no sus seguimientos', async () => {
    const r = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.beto}`);
    expect(r.status).toBe(403);
    expect((r.json as { error: { code: string } }).error.code).toBe('PERMISO_DENEGADO');
    expect(JSON.stringify(r.json)).not.toContain(seguimientoDe.beto);
  });

  it('sin parámetro, con «yo» o con su propio id ve los suyos', async () => {
    const sin = await get('ana', '/api/v1/crm/seguimientos');
    const yo = await get('ana', '/api/v1/crm/seguimientos?asesorId=yo');
    const propio = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.ana}`);
    expect(ids(sin)).toEqual([seguimientoDe.ana]);
    expect(yo.json).toEqual(sin.json);
    expect(propio.json).toEqual(sin.json);
  });

  it('el 403 no revela si el asesor existe: el mismo con un id ajeno, inexistente o de otra agencia', async () => {
    const ajeno = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.beto}`);
    const inexistente = await get(
      'ana',
      '/api/v1/crm/seguimientos?asesorId=01932000-0000-7000-8000-0000000fffff',
    );
    const deOtraAgencia = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.bruno}`);
    expect(inexistente.status).toBe(403);
    expect(deOtraAgencia.status).toBe(403);
    expect(inexistente.json).toEqual(ajeno.json);
    expect(deOtraAgencia.json).toEqual(ajeno.json);
  });

  it('otros filtros tampoco abren los de otro asesor', async () => {
    const r = await get('ana', `/api/v1/crm/seguimientos?estado=TODOS&asesorId=${U.beto}`);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.json)).not.toContain(seguimientoDe.beto);
  });

  it('el dueño ve toda la agencia sin parámetro, y el filtro asesorId funciona', async () => {
    const todos = await get('dueno', '/api/v1/crm/seguimientos');
    expect(ids(todos).sort()).toEqual([seguimientoDe.ana, seguimientoDe.beto].sort());
    const deBeto = await get('dueno', `/api/v1/crm/seguimientos?asesorId=${U.beto}`);
    expect(ids(deBeto)).toEqual([seguimientoDe.beto]);
    const deMi = await get('dueno', '/api/v1/crm/seguimientos?asesorId=yo');
    expect(ids(deMi)).toEqual([]);
  });

  it('aislamiento: nadie ve los de la otra agencia, ni con el asesorId de allá', async () => {
    const dueno = await get('dueno', `/api/v1/crm/seguimientos?asesorId=${U.bruno}`);
    expect(ids(dueno)).toEqual([]);
    const bruno = await get('bruno', '/api/v1/crm/seguimientos');
    expect(ids(bruno)).toEqual([seguimientoDe.bruno]);
  });
});

describe('GET /crm/seguimientos/pendientes-del-dia?asesorId= (H2, T-342)', () => {
  it('un asesor sin ver_todas con el asesorId de otro recibe 403', async () => {
    const r = await get('ana', `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.beto}`);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.json)).not.toContain(seguimientoDe.beto);
  });

  it('sin parámetro, con «yo» o con su propio id recibe lo suyo', async () => {
    const sin = await get('ana', '/api/v1/crm/seguimientos/pendientes-del-dia');
    const yo = await get('ana', '/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=yo');
    const propio = await get(
      'ana',
      `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.ana}`,
    );
    expect(sin.status).toBe(200);
    expect(idsDelDia(sin)).toEqual([seguimientoDe.ana]);
    expect(yo.json).toEqual(sin.json);
    expect(propio.json).toEqual(sin.json);
  });

  it('un asesorId mal formado es 400 para todos, antes de mirar permisos', async () => {
    const asesor = await get('ana', '/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=zzz');
    const dueno = await get('dueno', '/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=zzz');
    expect(asesor.status).toBe(400);
    expect(dueno.status).toBe(400);
  });

  it('el dueño con el asesorId de Beto ve lo de Beto; sin parámetro, lo suyo (nada)', async () => {
    const deBeto = await get(
      'dueno',
      `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.beto}`,
    );
    expect(idsDelDia(deBeto)).toEqual([seguimientoDe.beto]);
    const propios = await get('dueno', '/api/v1/crm/seguimientos/pendientes-del-dia');
    expect(idsDelDia(propios)).toEqual([]);
  });

  it('aislamiento: el dueño de A con el asesorId de B no recibe nada de B', async () => {
    const r = await get('dueno', `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.bruno}`);
    expect(idsDelDia(r)).toEqual([]);
  });
});
