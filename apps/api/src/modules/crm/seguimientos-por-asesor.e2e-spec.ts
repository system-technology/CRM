/**
 * H2 (D3: «el asesor ve lo suyo, el administrador todo»): `?asesorId=` en
 * `GET /crm/seguimientos` y `GET /crm/seguimientos/pendientes-del-dia`, de punta a punta con
 * sesiones reales, HTTP real y PostgreSQL con RLS.
 *
 * Agencia A: `dueno` (con `conversaciones.ver_todas`), `ana` y `beto` (asesores, sin él).
 * Agencia B: `bruno` (con `ver_todas`), para comprobar que el aislamiento entre agencias sigue.
 * Cada asesor de A tiene un seguimiento vencido; B tiene uno propio.
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

async function seguimiento(tenantId: string, quien: Persona): Promise<string> {
  const contacto = await admin.contacto.create({
    data: {
      tenantId,
      telefonoE164: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: `Viajero ${quien}`,
    },
  });
  const s = await admin.seguimiento.create({
    data: {
      tenantId,
      descripcion: `Llamar de parte de ${quien}`,
      venceEn: new Date(Date.now() - 3 * 24 * 3600_000),
      asesorId: U[quien],
      contactoId: contacto.id,
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

describe('GET /crm/seguimientos?asesorId= (H2)', () => {
  it('un asesor sin ver_todas pasando el asesorId de otro ve SOLO los suyos', async () => {
    const r = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.beto}`);
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual([seguimientoDe.ana]);
  });

  it('la respuesta con el asesorId ajeno es idéntica a la que no lleva parámetro', async () => {
    const con = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.beto}`);
    const sin = await get('ana', '/api/v1/crm/seguimientos');
    const yo = await get('ana', '/api/v1/crm/seguimientos?asesorId=yo');
    expect(con.status).toBe(200);
    expect(con.json).toEqual(sin.json);
    expect(yo.json).toEqual(sin.json);
    expect(ids(sin)).toEqual([seguimientoDe.ana]);
  });

  it('un asesor sin ver_todas no ve los de otro ni con su id de seguimiento por otros filtros', async () => {
    const r = await get('ana', `/api/v1/crm/seguimientos?estado=TODOS&asesorId=${U.beto}`);
    expect(ids(r)).not.toContain(seguimientoDe.beto);
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
    const ana = await get('ana', `/api/v1/crm/seguimientos?asesorId=${U.bruno}`);
    expect(ids(ana)).not.toContain(seguimientoDe.bruno);
    const bruno = await get('bruno', '/api/v1/crm/seguimientos');
    expect(ids(bruno)).toEqual([seguimientoDe.bruno]);
  });
});

describe('GET /crm/seguimientos/pendientes-del-dia?asesorId= (H2)', () => {
  it('un asesor sin ver_todas con el asesorId de otro recibe SOLO lo suyo', async () => {
    const r = await get('ana', `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.beto}`);
    expect(r.status).toBe(200);
    expect(idsDelDia(r)).toEqual([seguimientoDe.ana]);
  });

  it('misma forma de respuesta que sin parámetro, también con un valor basura', async () => {
    const sin = await get('ana', '/api/v1/crm/seguimientos/pendientes-del-dia');
    const ajeno = await get(
      'ana',
      `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.beto}`,
    );
    const basura = await get('ana', '/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=zzz');
    expect(sin.status).toBe(200);
    expect(ajeno.json).toEqual(sin.json);
    expect(basura.status).toBe(200);
    expect(basura.json).toEqual(sin.json);
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

  it('el dueño con un asesorId mal formado sigue recibiendo 400', async () => {
    const r = await get('dueno', '/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=zzz');
    expect(r.status).toBe(400);
  });

  it('aislamiento: el dueño de A con el asesorId de B no recibe nada de B', async () => {
    const r = await get('dueno', `/api/v1/crm/seguimientos/pendientes-del-dia?asesorId=${U.bruno}`);
    expect(idsDelDia(r)).toEqual([]);
  });
});
