/**
 * `GET /api/v1/identidad/miembros/asignables` (ADR-0022, T-186), de punta a punta: aplicación
 * ensamblada, HTTP real, PostgreSQL con RLS y el rol de la API.
 *
 * Fixture: la agencia A con Ana y Dora (rol asesor, `bandeja.operar`), Beto (asesor dado de baja)
 * y Olga (rol OPERACIONES, sin `bandeja.operar`); la agencia B con Bruno (asesor).
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { ListaDeMiembrosAsignables, MiembroAsignable } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { conversacionConVistaPrevia } from '../../shared/cifrado/cifrado-de-prueba.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
type Persona = 'ana' | 'dora' | 'beto' | 'olga' | 'bruno';
const correo = (quien: string): string =>
  `fixture-asignables-${randomBytes(3).toString('hex')}-${quien}@fixture-identidad.test`;
const CORREO: Record<Persona, string> = {
  ana: correo('ana'),
  dora: correo('dora'),
  beto: correo('beto'),
  olga: correo('olga'),
  bruno: correo('bruno'),
};
const NOMBRE: Record<Persona, string> = {
  ana: 'Ana Ríos',
  dora: 'Álvaro Dora',
  beto: 'Beto Baja',
  olga: 'Olga Operaciones',
  bruno: 'Bruno Otra Agencia',
};
const identidades: string[] = [];
const U = {} as Record<Persona, string>;
const cookies = {} as Record<Persona, string>;

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let conversacionDeA = '';

const rnd = (): number => Math.floor(Math.random() * 250) + 1;

async function persona(
  quien: Persona,
  tenantId: string,
  rolId: string,
  o: { activo?: boolean; eliminado?: boolean } = {},
): Promise<void> {
  const i = await admin.identidad.create({
    data: { correo: CORREO[quien], nombre: NOMBRE[quien], correoVerificado: true },
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
    data: {
      tenantId,
      identidadId: i.id,
      rolId,
      correo: CORREO[quien],
      nombre: NOMBRE[quien],
      activo: o.activo ?? true,
      eliminadoEn: o.eliminado ? new Date() : null,
    },
  });
  U[quien] = u.id;
}

interface Respuesta {
  status: number;
  json: unknown;
}

async function api(
  quien: Persona,
  metodo: 'GET' | 'PUT',
  ruta: string,
  cuerpo?: unknown,
): Promise<Respuesta> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      cookie: cookies[quien],
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  return { status: r.status, json: texto ? (JSON.parse(texto) as unknown) : {} };
}

async function iniciarSesion(quien: Persona): Promise<string> {
  const r = await fetch(new URL('/api/v1/auth/sign-in/email', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    body: JSON.stringify({ correo: CORREO[quien], contrasena: CLAVE }),
  });
  expect(r.status).toBe(200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

const codigo = (r: Respuesta): unknown => (r.json as { error?: { code?: unknown } }).error?.code;

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  for (const [id, sufijo] of [
    [TENANT_A, 'A'],
    [TENANT_B, 'B'],
  ] as const) {
    await admin.tenant.create({
      data: { id, slug: `fixture-asignables-${id.slice(-12)}`, nombre: `Agencia ${sufijo}` },
    });
  }
  const rolAsesorA = await admin.rol.create({
    data: { tenantId: TENANT_A, nombre: 'Asesor', clave: 'ASESOR', permisos: ['bandeja.operar'] },
  });
  const rolOperaciones = await admin.rol.create({
    data: {
      tenantId: TENANT_A,
      nombre: 'Operaciones',
      clave: 'OPERACIONES',
      permisos: ['crm.escribir'],
    },
  });
  const rolAsesorB = await admin.rol.create({
    data: { tenantId: TENANT_B, nombre: 'Asesor', clave: 'ASESOR', permisos: ['bandeja.operar'] },
  });
  await persona('ana', TENANT_A, rolAsesorA.id);
  await persona('dora', TENANT_A, rolAsesorA.id);
  await persona('beto', TENANT_A, rolAsesorA.id, { activo: false, eliminado: true });
  await persona('olga', TENANT_A, rolOperaciones.id);
  await persona('bruno', TENANT_B, rolAsesorB.id);

  // Una conversación sin asignar de la agencia A, para la prueba del PUT.
  const cuenta = await admin.cuentaWhatsapp.create({
    data: {
      tenantId: TENANT_A,
      wabaId: `waba-asig-${randomBytes(4).toString('hex')}`,
      nombre: 'W',
    },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId: TENANT_A,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  const contacto = await admin.contacto.create({
    data: {
      tenantId: TENANT_A,
      telefonoE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: 'Viajero',
    },
  });
  const ahora = new Date();
  conversacionDeA = (
    await admin.conversacion.create({
      data: {
        tenantId: TENANT_A,
        canalId: canal.id,
        contactoId: contacto.id,
        asignadoAId: null,
        ultimoMensajeClienteEn: ahora,
        ultimoMensajeEn: ahora,
        ...conversacionConVistaPrevia(TENANT_A, 'hola'),
        ultimoMensajeDireccion: 'ENTRANTE',
      },
    })
  ).id;

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();

  for (const p of ['ana', 'dora', 'olga', 'bruno'] as const) cookies[p] = await iniciarSesion(p);
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

describe('GET /api/v1/identidad/miembros/asignables (ADR-0022)', () => {
  it('un asesor recibe 200 con solo id y nombre, ordenados por nombre y sin la clave correo', async () => {
    const r = await api('ana', 'GET', '/api/v1/identidad/miembros/asignables');
    expect(r.status).toBe(200);
    const lista = ListaDeMiembrosAsignables.parse(r.json);
    for (const m of r.json as Array<Record<string, unknown>>) {
      expect(Object.keys(m).sort()).toEqual(['id', 'nombre']);
      expect(m).not.toHaveProperty('correo');
      expect(MiembroAsignable.safeParse({ ...m, correo: 'x@y.z' }).success).toBe(false);
    }
    // Incluye a quien pregunta, y el orden es el de `es`.
    expect(lista).toEqual([
      { id: U.dora, nombre: NOMBRE.dora },
      { id: U.ana, nombre: NOMBRE.ana },
    ]);
  });

  it('un rol sin bandeja.operar (OPERACIONES) recibe 403 PERMISO_DENEGADO', async () => {
    const r = await api('olga', 'GET', '/api/v1/identidad/miembros/asignables');
    expect(r.status).toBe(403);
    expect(codigo(r)).toBe('PERMISO_DENEGADO');
  });

  it('aislamiento: la lista de A no contiene ningún id de B, ni la de B uno de A', async () => {
    const a = ListaDeMiembrosAsignables.parse(
      (await api('ana', 'GET', '/api/v1/identidad/miembros/asignables')).json,
    );
    const b = ListaDeMiembrosAsignables.parse(
      (await api('bruno', 'GET', '/api/v1/identidad/miembros/asignables')).json,
    );
    expect(a.map((m) => m.id)).not.toContain(U.bruno);
    expect(b).toEqual([{ id: U.bruno, nombre: NOMBRE.bruno }]);
    const idsA = new Set(a.map((m) => m.id));
    expect(b.some((m) => idsA.has(m.id))).toBe(false);
  });

  it('no aparecen el miembro dado de baja ni el de un rol sin bandeja.operar', async () => {
    const ids = ListaDeMiembrosAsignables.parse(
      (await api('ana', 'GET', '/api/v1/identidad/miembros/asignables')).json,
    ).map((m) => m.id);
    expect(ids).not.toContain(U.beto);
    expect(ids).not.toContain(U.olga);
  });
});

describe('PUT /api/v1/conversaciones/:id/asignacion con el mismo criterio', () => {
  it('asignar a un miembro de OPERACIONES (sin bandeja.operar) o de baja da USUARIO_NO_ASIGNABLE', async () => {
    for (const usuarioId of [U.olga, U.beto, U.bruno, randomUUID()]) {
      const r = await api('ana', 'PUT', `/api/v1/conversaciones/${conversacionDeA}/asignacion`, {
        usuarioId,
      });
      expect(r.status).toBe(422);
      expect(codigo(r)).toBe('USUARIO_NO_ASIGNABLE');
    }
    const f = await admin.conversacion.findUniqueOrThrow({
      where: { id: conversacionDeA },
      select: { asignadoAId: true },
    });
    expect(f.asignadoAId).toBeNull();
  });

  it('asignar a un miembro de la lista funciona', async () => {
    const r = await api('ana', 'PUT', `/api/v1/conversaciones/${conversacionDeA}/asignacion`, {
      usuarioId: U.dora,
    });
    expect(r.status).toBe(200);
  });
});
