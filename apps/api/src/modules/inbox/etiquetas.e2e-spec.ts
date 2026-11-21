/**
 * Etiquetas de conversación (T-325, HU-inbox-1), de punta a punta: aplicación ensamblada, HTTP real
 * con sesiones reales (better-auth), PostgreSQL con RLS y el rol de la API.
 *
 * Fixture: la agencia A con un **Dueño** (`etiquetas.administrar`, `conversaciones.ver_todas`,
 * `bandeja.operar`), **Ana** y **Beto** (asesores: `bandeja.operar`, sin `ver_todas`) y un **Lector**
 * (sin permisos de bandeja); la agencia B con **Bruno** (dueño de B). Conversaciones de A: C1 de
 * Ana, C2 de Beto y C3 sin asignar.
 *
 * R10: el nombre de una etiqueta es texto libre y puede ser el de una persona. Cada prueba que
 * produce errores deja que el log los capture, y la última afirma que el nombre no aparece en
 * ninguno ni en el outbox.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { type LoggerService, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  ConversacionResumen,
  Etiqueta,
  ListaDeEtiquetas,
  PaginaBandeja,
  type Permiso,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { conversacionConVistaPrevia } from '../../shared/cifrado/cifrado-de-prueba.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

/** Los caracteres raros se arman por punto de código: un literal invisible no se puede revisar. */
const cp = (n: number): string => String.fromCodePoint(n);

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const NOMBRE_SENSIBLE = 'Seguimiento Marta Gómez';
const PATRON_SENSIBLE = /Marta|G[oó]mez/i;

type Persona = 'dueno' | 'ana' | 'beto' | 'lector' | 'bruno';
const correo = (quien: string): string =>
  `fixture-etiquetas-${randomBytes(3).toString('hex')}-${quien}@fixture-identidad.test`;
const CORREO = Object.fromEntries(
  (['dueno', 'ana', 'beto', 'lector', 'bruno'] as const).map((p) => [p, correo(p)]),
) as Record<Persona, string>;
const identidades: string[] = [];
const U = {} as Record<Persona, string>;
const cookies = {} as Record<Persona, string>;

let app: NestExpressApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let canalA = '';
let canalB = '';

const rnd = (): number => Math.floor(Math.random() * 250) + 1;

/** Todo lo que el servidor escribe en el log durante la prueba. */
const registro: string[] = [];
class LogCapturador implements LoggerService {
  log(m: unknown, ...r: unknown[]): void {
    registro.push([m, ...r].map(String).join(' '));
  }
  error(m: unknown, ...r: unknown[]): void {
    registro.push([m, ...r].map(String).join(' '));
  }
  warn(m: unknown, ...r: unknown[]): void {
    registro.push([m, ...r].map(String).join(' '));
  }
  debug(m: unknown, ...r: unknown[]): void {
    registro.push([m, ...r].map(String).join(' '));
  }
  verbose(m: unknown, ...r: unknown[]): void {
    registro.push([m, ...r].map(String).join(' '));
  }
}

// ----------------------------------------------------------------------------------- fixture

async function agencia(id: string, sufijo: string): Promise<string> {
  await admin.tenant.create({
    data: { id, slug: `fixture-etiquetas-${id.slice(-12)}`, nombre: `Agencia ${sufijo}` },
  });
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId: id, wabaId: `waba-etq-${randomBytes(4).toString('hex')}`, nombre: 'WABA' },
  });
  const c = await admin.canal.create({
    data: {
      tenantId: id,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  return c.id;
}

async function rol(tenantId: string, nombre: string, permisos: Permiso[]): Promise<string> {
  return (await admin.rol.create({ data: { tenantId, nombre, permisos } })).id;
}

async function persona(quien: Persona, tenantId: string, rolId: string): Promise<void> {
  const i = await admin.identidad.create({
    data: { correo: CORREO[quien], nombre: quien, correoVerificado: true },
  });
  await admin.credencial.create({
    data: { identidadId: i.id, proveedor: 'credential', hashContrasena: await hashPassword(CLAVE) },
  });
  identidades.push(i.id);
  const u = await admin.usuario.create({
    data: {
      tenantId,
      identidadId: i.id,
      rolId,
      correo: CORREO[quien],
      nombre: quien,
      activo: true,
    },
  });
  U[quien] = u.id;
}

async function conversacion(
  tenantId: string,
  canalId: string,
  asignadaA: string | null,
): Promise<string> {
  const contacto = await admin.contacto.create({
    data: {
      tenantId,
      telefonoE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: `Viajero ${randomBytes(3).toString('hex')}`,
    },
  });
  const ahora = new Date();
  const c = await admin.conversacion.create({
    data: {
      tenantId,
      canalId,
      contactoId: contacto.id,
      asignadoAId: asignadaA,
      ultimoMensajeClienteEn: ahora,
      ultimoMensajeEn: ahora,
      ...conversacionConVistaPrevia(tenantId, 'hola'),
      ultimoMensajeDireccion: 'ENTRANTE',
    },
  });
  return c.id;
}

/** Una etiqueta escrita con el rol propietario, sin pasar por la API. */
async function etiquetaDirecta(
  tenantId: string,
  nombre: string,
  color = 'gris',
  orden = 0,
): Promise<string> {
  return (await admin.label.create({ data: { tenantId, nombre, color, orden } })).id;
}

// ---------------------------------------------------------------------------------------- HTTP

interface Respuesta {
  status: number;
  json: Record<string, unknown>;
}

async function api(
  quien: Persona,
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
    body: JSON.stringify({ correo: CORREO[quien], contrasena: CLAVE }),
  });
  expect(r.status).toBe(200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

const codigo = (r: Respuesta): unknown => (r.json['error'] as { code?: unknown } | undefined)?.code;
const idsDe = (r: Respuesta): string[] =>
  ((r.json['datos'] as Array<{ id: string }> | undefined) ?? []).map((f) => f.id);

const crear = (quien: Persona, nombre: string, color = 'azul'): Promise<Respuesta> =>
  api(quien, 'POST', '/api/v1/etiquetas', { nombre, color });
const poner = (quien: Persona, conv: string, etiqueta: string): Promise<Respuesta> =>
  api(quien, 'PUT', `/api/v1/conversaciones/${conv}/etiquetas/${etiqueta}`);
const quitar = (quien: Persona, conv: string, etiqueta: string): Promise<Respuesta> =>
  api(quien, 'DELETE', `/api/v1/conversaciones/${conv}/etiquetas/${etiqueta}`);

async function eventosDe(tenantId: string, conversacionId: string): Promise<number> {
  return admin.outbox.count({
    where: { tenantId, agregadoId: conversacionId, tipoEvento: 'inbox.conversacion_actualizada' },
  });
}

// -------------------------------------------------------------------------------- arranque

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  canalA = await agencia(TENANT_A, 'A');
  canalB = await agencia(TENANT_B, 'B');

  const rolDueno = await rol(TENANT_A, 'Dueño', [
    'conversaciones.ver_todas',
    'bandeja.operar',
    'etiquetas.administrar',
  ]);
  const rolAsesor = await rol(TENANT_A, 'Asesor', ['bandeja.operar']);
  const rolLector = await rol(TENANT_A, 'Lector', []);
  const rolB = await rol(TENANT_B, 'Dueño', [
    'conversaciones.ver_todas',
    'bandeja.operar',
    'etiquetas.administrar',
  ]);
  await persona('dueno', TENANT_A, rolDueno);
  await persona('ana', TENANT_A, rolAsesor);
  await persona('beto', TENANT_A, rolAsesor);
  await persona('lector', TENANT_A, rolLector);
  await persona('bruno', TENANT_B, rolB);

  // El capturador va en la opción `logger`: `NestFactory.create` la aplica con `overrideLogger`, y
  // con `logger: false` apagaría uno puesto antes.
  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new LogCapturador(),
  });
  app.useGlobalFilters(new DominioExcepcionFilter());
  app.set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();

  for (const p of ['dueno', 'ana', 'beto', 'lector', 'bruno'] as const) {
    cookies[p] = await iniciarSesion(p);
  }
});

afterAll(async () => {
  Logger.overrideLogger(true);
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

// ============================================================================================
// Catálogo
// ============================================================================================

describe('catálogo', () => {
  it('el Dueño crea una etiqueta (201) con el nombre normalizado y la ve cualquier usuario de la agencia', async () => {
    const r = await crear('dueno', cp(0x00a0) + ' Pago' + cp(0x2003) + 'pendiente ', 'ambar');
    expect(r.status).toBe(201);
    const e = Etiqueta.parse(r.json);
    expect(e).toMatchObject({ nombre: 'Pago pendiente', color: 'ambar' });

    for (const quien of ['dueno', 'ana', 'lector'] as const) {
      const l = await api(quien, 'GET', '/api/v1/etiquetas');
      expect(l.status, quien).toBe(200);
      expect(ListaDeEtiquetas.parse(l.json).datos.map((x) => x.id)).toContain(e.id);
    }
  });

  it('sin etiquetas.administrar: crear, renombrar y borrar son 403 PERMISO_DENEGADO y no cambian nada', async () => {
    const id = await etiquetaDirecta(TENANT_A, 'Intocable');
    for (const quien of ['ana', 'lector'] as const) {
      const c = await crear(quien, 'Nueva');
      expect([c.status, codigo(c)], `crear ${quien}`).toEqual([403, 'PERMISO_DENEGADO']);
      const p = await api(quien, 'PATCH', `/api/v1/etiquetas/${id}`, { nombre: 'Otra' });
      expect([p.status, codigo(p)], `renombrar ${quien}`).toEqual([403, 'PERMISO_DENEGADO']);
      const d = await api(quien, 'DELETE', `/api/v1/etiquetas/${id}`);
      expect([d.status, codigo(d)], `borrar ${quien}`).toEqual([403, 'PERMISO_DENEGADO']);
    }
    const fila = await admin.label.findUniqueOrThrow({ where: { id } });
    expect(fila.nombre).toBe('Intocable');
  });

  it('«Pagado» y « pagado » chocan: 409 ETIQUETA_DUPLICADA, sin el nombre en el mensaje, y nada se guarda', async () => {
    const primera = await crear('dueno', 'Pagado', 'verde');
    expect(primera.status).toBe(201);
    const choca = await crear('dueno', ' ' + cp(0x00a0) + 'pagado ', 'azul');
    expect([choca.status, codigo(choca)]).toEqual([409, 'ETIQUETA_DUPLICADA']);
    expect(JSON.stringify(choca.json)).not.toMatch(/pagado/i);
    const n = await admin.label.count({
      where: { tenantId: TENANT_A, nombre: { equals: 'pagado', mode: 'insensitive' } },
    });
    expect(n).toBe(1);
  });

  it('la misma etiqueta en OTRA agencia no choca (la unicidad es por agencia)', async () => {
    const r = await crear('bruno', 'Pagado', 'verde');
    expect(r.status).toBe(201);
  });

  it('cinco creaciones simultáneas del mismo nombre: una gana, cuatro 409 y ningún 500', async () => {
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => crear('dueno', 'Carrera de creación')),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && codigo(r) === 'ETIQUETA_DUPLICADA')).toHaveLength(
      4,
    );
  });

  it.each([
    ['con ancho cero U+200B', 'Pa' + cp(0x200b) + 'gado'],
    ['con BOM U+FEFF', cp(0xfeff) + 'Pagado'],
    ['con control bidireccional U+202E', 'Pagado' + cp(0x202e)],
    ['con aislamiento bidireccional U+2067', 'Pa' + cp(0x2067) + 'gado'],
    ['con control C1', 'Pa\u0085gado'],
    ['con un nulo', 'Pa\u0000gado'],
    ['vacío', '   '],
    ['de 31 caracteres', 'x'.repeat(31)],
  ])('un nombre %s es 400 ENTRADA_INVALIDA', async (_n, nombre) => {
    const r = await crear('dueno', nombre);
    expect([r.status, codigo(r)]).toEqual([400, 'ENTRADA_INVALIDA']);
  });

  it('un color fuera de la paleta (rojo, hexadecimal) es 400', async () => {
    for (const color of ['rojo', '#ff0000', '']) {
      const r = await crear('dueno', 'Con color raro', color);
      expect(r.status, color).toBe(400);
    }
  });

  it('renombrar conserva el id y las asignaciones; renombrar a un nombre existente es 409', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'Para renombrar', 'rosa')).json);
    const otra = Etiqueta.parse((await crear('dueno', 'Ya existe uno', 'gris')).json);
    const conv = await conversacion(TENANT_A, canalA, null);
    expect((await poner('dueno', conv, e.id)).status).toBe(200);

    const r = await api('dueno', 'PATCH', `/api/v1/etiquetas/${e.id}`, {
      nombre: 'Renombrada',
      color: 'turquesa',
    });
    expect(r.status).toBe(200);
    expect(Etiqueta.parse(r.json)).toMatchObject({
      id: e.id,
      nombre: 'Renombrada',
      color: 'turquesa',
    });
    const detalle = ConversacionResumen.parse(
      (await api('dueno', 'GET', `/api/v1/conversaciones/${conv}`)).json,
    );
    expect(detalle.etiquetas).toEqual([{ id: e.id, nombre: 'Renombrada', color: 'turquesa' }]);

    const choca = await api('dueno', 'PATCH', `/api/v1/etiquetas/${e.id}`, {
      nombre: otra.nombre.toUpperCase(),
    });
    expect([choca.status, codigo(choca)]).toEqual([409, 'ETIQUETA_DUPLICADA']);
    const vacio = await api('dueno', 'PATCH', `/api/v1/etiquetas/${e.id}`, {});
    expect(vacio.status).toBe(400);
  });

  it('ordenar: el catálogo sale por orden', async () => {
    const a = Etiqueta.parse((await crear('dueno', 'Orden uno')).json);
    const b = Etiqueta.parse((await crear('dueno', 'Orden dos')).json);
    expect(b.orden).toBeGreaterThan(a.orden);
    await api('dueno', 'PATCH', `/api/v1/etiquetas/${b.id}`, { orden: 0 });
    await api('dueno', 'PATCH', `/api/v1/etiquetas/${a.id}`, { orden: 9 });
    const ids = ListaDeEtiquetas.parse(
      (await api('ana', 'GET', '/api/v1/etiquetas')).json,
    ).datos.map((x) => x.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it('borrar se lleva las asignaciones de todas las conversaciones; borrarla otra vez es 404', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'Para borrar')).json);
    const c1 = await conversacion(TENANT_A, canalA, null);
    const c2 = await conversacion(TENANT_A, canalA, null);
    await poner('dueno', c1, e.id);
    await poner('dueno', c2, e.id);
    expect(await admin.conversationLabel.count({ where: { etiquetaId: e.id } })).toBe(2);

    const r = await api('dueno', 'DELETE', `/api/v1/etiquetas/${e.id}`);
    expect([r.status, r.json['ok']]).toEqual([200, true]);
    expect(await admin.conversationLabel.count({ where: { etiquetaId: e.id } })).toBe(0);
    expect(await admin.label.count({ where: { id: e.id } })).toBe(0);
    const otra = await api('dueno', 'DELETE', `/api/v1/etiquetas/${e.id}`);
    expect([otra.status, codigo(otra)]).toEqual([404, 'ETIQUETA_NO_ENCONTRADA']);
  });

  it('un id mal formado es 400 y no 404', async () => {
    expect(
      (await api('dueno', 'PATCH', '/api/v1/etiquetas/no-es-un-uuid', { color: 'azul' })).status,
    ).toBe(400);
    expect((await api('dueno', 'DELETE', '/api/v1/etiquetas/no-es-un-uuid')).status).toBe(400);
  });
});

// ============================================================================================
// Topes
// ============================================================================================

describe('topes', () => {
  it('50 etiquetas por agencia: la 51 es 422 TOPE_DE_ETIQUETAS_DE_LA_AGENCIA; una agencia no cuenta las de otra', async () => {
    // Agencia B: Bruno ya creó «Pagado». Se llena hasta 50 con el rol propietario.
    const existentes = await admin.label.count({ where: { tenantId: TENANT_B } });
    await admin.label.createMany({
      data: Array.from({ length: 50 - existentes }, (_, i) => ({
        tenantId: TENANT_B,
        nombre: `Tope ${i}`,
        color: 'gris',
        orden: i + 1,
      })),
    });
    expect(await admin.label.count({ where: { tenantId: TENANT_B } })).toBe(50);
    const r = await crear('bruno', 'La cincuenta y una');
    expect([r.status, codigo(r)]).toEqual([422, 'TOPE_DE_ETIQUETAS_DE_LA_AGENCIA']);
    expect(await admin.label.count({ where: { tenantId: TENANT_B } })).toBe(50);
    // La agencia A, con sus pocas etiquetas, sigue creando.
    expect((await crear('dueno', `Tope de A ${randomBytes(2).toString('hex')}`)).status).toBe(201);
    // Se deshace el relleno: las pruebas siguientes crean etiquetas en B y toparían con las 50.
    await admin.label.deleteMany({ where: { tenantId: TENANT_B, nombre: { startsWith: 'Tope ' } } });
    expect(await admin.label.count({ where: { tenantId: TENANT_B } })).toBeLessThan(50);
  });

  it('10 etiquetas por conversación: la 11 es 422; repetir una puesta es idempotente aun en el tope', async () => {
    const conv = await conversacion(TENANT_A, canalA, null);
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) ids.push(await etiquetaDirecta(TENANT_A, `Conv ${i}`, 'gris', i));
    for (const id of ids.slice(0, 10)) expect((await poner('dueno', conv, id)).status).toBe(200);
    const once = await poner('dueno', conv, ids[10] as string);
    expect([once.status, codigo(once)]).toEqual([422, 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION']);
    const repetida = await poner('dueno', conv, ids[0] as string);
    expect(repetida.status).toBe(200);
    expect(await admin.conversationLabel.count({ where: { conversacionId: conv } })).toBe(10);
  });

  it('doce peticiones simultáneas a una conversación vacía: exactamente 10 entran', async () => {
    const conv = await conversacion(TENANT_A, canalA, null);
    const ids: string[] = [];
    for (let i = 0; i < 12; i++)
      ids.push(await etiquetaDirecta(TENANT_A, `Carrera ${i}`, 'gris', i));
    const rs = await Promise.all(ids.map((id) => poner('dueno', conv, id)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(10);
    expect(
      rs.filter((r) => r.status === 422 && codigo(r) === 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION'),
    ).toHaveLength(2);
    expect(await admin.conversationLabel.count({ where: { conversacionId: conv } })).toBe(10);
  });
});

// ============================================================================================
// Poner y quitar
// ============================================================================================

describe('poner y quitar', () => {
  it('Ana pone una etiqueta en su conversación: 200 con la fila actualizada y UN evento; repetirlo no duplica ni emite otro', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'Poner y repetir', 'verde')).json);
    const conv = await conversacion(TENANT_A, canalA, U.ana);
    const antes = await eventosDe(TENANT_A, conv);

    const r = await poner('ana', conv, e.id);
    expect(r.status).toBe(200);
    expect(ConversacionResumen.parse(r.json).etiquetas).toEqual([
      { id: e.id, nombre: 'Poner y repetir', color: 'verde' },
    ]);
    expect(await eventosDe(TENANT_A, conv)).toBe(antes + 1);

    const otra = await poner('ana', conv, e.id);
    expect(otra.status).toBe(200);
    expect(await admin.conversationLabel.count({ where: { conversacionId: conv } })).toBe(1);
    expect(await eventosDe(TENANT_A, conv)).toBe(antes + 1);
    const fila = await admin.conversationLabel.findFirstOrThrow({
      where: { conversacionId: conv },
    });
    expect(fila.asignadaPorId).toBe(U.ana);
  });

  it('quitar es idempotente: la segunda vez responde 200 igual y no emite evento', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'Quitar y repetir')).json);
    const conv = await conversacion(TENANT_A, canalA, U.ana);
    await poner('ana', conv, e.id);
    const antes = await eventosDe(TENANT_A, conv);
    const r = await quitar('ana', conv, e.id);
    expect(r.status).toBe(200);
    expect(ConversacionResumen.parse(r.json).etiquetas).toEqual([]);
    expect(await eventosDe(TENANT_A, conv)).toBe(antes + 1);
    const otra = await quitar('ana', conv, e.id);
    expect(otra.status).toBe(200);
    expect(await eventosDe(TENANT_A, conv)).toBe(antes + 1);
  });

  it('el Lector (sin bandeja.operar) no puede poner ni quitar: 403', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'Solo operadores')).json);
    const conv = await conversacion(TENANT_A, canalA, null);
    for (const f of [poner, quitar]) {
      const r = await f('lector', conv, e.id);
      expect([r.status, codigo(r)]).toEqual([403, 'PERMISO_DENEGADO']);
    }
    expect(await admin.conversationLabel.count({ where: { conversacionId: conv } })).toBe(0);
  });

  it('una conversación de otro asesor (sin ver_todas) es el mismo 404 que una inexistente, para poner y quitar', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'De Ana')).json);
    const deAna = await conversacion(TENANT_A, canalA, U.ana);
    for (const f of [poner, quitar]) {
      const ajena = await f('beto', deAna, e.id);
      const inexistente = await f('beto', randomUUID(), e.id);
      expect([ajena.status, codigo(ajena)]).toEqual([404, 'CONVERSACION_NO_ENCONTRADA']);
      expect(ajena.json).toEqual(inexistente.json);
      expect(ajena.status).toBe(inexistente.status);
    }
    expect(await admin.conversationLabel.count({ where: { conversacionId: deAna } })).toBe(0);
    // El Dueño, con ver_todas, sí puede.
    expect((await poner('dueno', deAna, e.id)).status).toBe(200);
  });

  it('la cola común (sin asignar) la etiqueta cualquier asesor', async () => {
    const e = Etiqueta.parse((await crear('dueno', 'De la cola')).json);
    const cola = await conversacion(TENANT_A, canalA, null);
    expect((await poner('beto', cola, e.id)).status).toBe(200);
  });

  it('una etiqueta inexistente es 404 ETIQUETA_NO_ENCONTRADA', async () => {
    const conv = await conversacion(TENANT_A, canalA, U.ana);
    const r = await poner('ana', conv, randomUUID());
    expect([r.status, codigo(r)]).toEqual([404, 'ETIQUETA_NO_ENCONTRADA']);
  });

  it('un id mal formado es 400', async () => {
    const conv = await conversacion(TENANT_A, canalA, U.ana);
    expect(
      (await api('ana', 'PUT', `/api/v1/conversaciones/${conv}/etiquetas/no-uuid`)).status,
    ).toBe(400);
    expect(
      (await api('ana', 'PUT', `/api/v1/conversaciones/no-uuid/etiquetas/${randomUUID()}`)).status,
    ).toBe(400);
  });
});

// ============================================================================================
// Filtro de la bandeja
// ============================================================================================

describe('filtro por etiqueta', () => {
  let c1 = '';
  let c2 = '';
  let c3 = '';
  let l1 = '';
  let l2 = '';

  beforeAll(async () => {
    // C1 de Ana, C2 de Beto, C3 sin asignar. L1 en las tres; L2 solo en C1 y C2.
    c1 = await conversacion(TENANT_A, canalA, U.ana);
    c2 = await conversacion(TENANT_A, canalA, U.beto);
    c3 = await conversacion(TENANT_A, canalA, null);
    l1 = Etiqueta.parse(
      (await crear('dueno', `Filtro uno ${randomBytes(2).toString('hex')}`)).json,
    ).id;
    l2 = Etiqueta.parse(
      (await crear('dueno', `Filtro dos ${randomBytes(2).toString('hex')}`)).json,
    ).id;
    for (const c of [c1, c2, c3]) await poner('dueno', c, l1);
    for (const c of [c1, c2]) await poner('dueno', c, l2);
  });

  const filtrar = (quien: Persona, consulta: string): Promise<Respuesta> =>
    api(quien, 'GET', `/api/v1/conversaciones?${consulta}`);

  it('el Dueño filtra por una etiqueta y ve las tres; la fila trae sus etiquetas', async () => {
    const r = await filtrar('dueno', `etiquetas=${l1}`);
    expect(r.status).toBe(200);
    const pagina = PaginaBandeja.parse(r.json);
    expect(idsDe(r).sort()).toEqual([c1, c2, c3].sort());
    expect(
      pagina.datos
        .find((f) => f.id === c1)
        ?.etiquetas.map((e) => e.id)
        .sort(),
    ).toEqual([l1, l2].sort());
  });

  it('«cualquiera» (por defecto) y «todas»', async () => {
    const cualquiera = await filtrar('dueno', `etiquetas=${l1},${l2}`);
    expect(idsDe(cualquiera).sort()).toEqual([c1, c2, c3].sort());
    const todas = await filtrar('dueno', `etiquetas=${l1},${l2}&modo=todas`);
    expect(idsDe(todas).sort()).toEqual([c1, c2].sort());
    const repetido = await filtrar('dueno', `etiquetas=${l1}&etiquetas=${l2}&modo=todas`);
    expect(idsDe(repetido).sort()).toEqual([c1, c2].sort());
  });

  it('sin ver_todas, Ana filtra solo dentro de lo que ve: C1 y la cola (C3), nunca C2 de Beto', async () => {
    const r = await filtrar('ana', `etiquetas=${l1}`);
    expect(idsDe(r).sort()).toEqual([c1, c3].sort());
    const todas = await filtrar('ana', `etiquetas=${l1},${l2}&modo=todas`);
    expect(idsDe(todas)).toEqual([c1]);
  });

  it('se combina en «y» con la vista y el estado', async () => {
    const mias = await filtrar('ana', `etiquetas=${l1}&filtro=MIAS`);
    expect(idsDe(mias)).toEqual([c1]);
    const sinAsignar = await filtrar('dueno', `etiquetas=${l1}&filtro=SIN_ASIGNAR`);
    expect(idsDe(sinAsignar)).toContain(c3);
    expect(idsDe(sinAsignar)).not.toContain(c1);
    await api('dueno', 'PATCH', `/api/v1/conversaciones/${c3}/estado`, { estado: 'CERRADA' });
    const cerradas = await filtrar('dueno', `etiquetas=${l1}&estado=CERRADA`);
    expect(idsDe(cerradas)).toEqual([c3]);
    // Las etiquetas se conservan al archivar.
    expect(PaginaBandeja.parse(cerradas.json).datos[0]?.etiquetas.map((e) => e.id)).toEqual([l1]);
  });

  it('el id de una etiqueta de OTRA agencia, o que no existe, da cero filas y no un error que confirme nada', async () => {
    const deB = Etiqueta.parse(
      (await crear('bruno', `De B ${randomBytes(2).toString('hex')}`)).json,
    ).id;
    const ajena = await filtrar('dueno', `etiquetas=${deB}`);
    const inexistente = await filtrar('dueno', `etiquetas=${randomUUID()}`);
    expect(ajena.status).toBe(200);
    expect(idsDe(ajena)).toEqual([]);
    expect(ajena.json).toEqual(inexistente.json);
    // En «todas», una ajena junto a una propia tampoco devuelve nada.
    const mixta = await filtrar('dueno', `etiquetas=${l1},${deB}&modo=todas`);
    expect(idsDe(mixta)).toEqual([]);
  });

  it('parámetros inválidos son 400: no-UUID, vacío, modo desconocido, más de 10', async () => {
    for (const consulta of [
      'etiquetas=pagado',
      'etiquetas=',
      `etiquetas=${l1}&modo=ninguna`,
      `etiquetas=${Array.from({ length: 11 }, () => randomUUID()).join(',')}`,
    ]) {
      const r = await filtrar('dueno', consulta);
      expect([r.status, codigo(r)], consulta).toEqual([400, 'ENTRADA_INVALIDA']);
    }
  });
});

// ============================================================================================
// Aislamiento entre agencias (R1: aquí no se recorta)
// ============================================================================================

describe('aislamiento entre agencias', () => {
  it('Bruno no ve las etiquetas de A y A no ve las de B', async () => {
    const deA = Etiqueta.parse(
      (await crear('dueno', `Solo de A ${randomBytes(2).toString('hex')}`)).json,
    );
    const deB = Etiqueta.parse(
      (await crear('bruno', `Solo de B ${randomBytes(2).toString('hex')}`)).json,
    );
    const listaB = ListaDeEtiquetas.parse((await api('bruno', 'GET', '/api/v1/etiquetas')).json);
    const listaA = ListaDeEtiquetas.parse((await api('dueno', 'GET', '/api/v1/etiquetas')).json);
    expect(listaB.datos.map((x) => x.id)).toContain(deB.id);
    expect(listaB.datos.map((x) => x.id)).not.toContain(deA.id);
    expect(listaA.datos.map((x) => x.id)).not.toContain(deB.id);
  });

  it('adivinando el id: renombrar, borrar y asignar una etiqueta ajena responde igual que una inexistente, y nada cambia', async () => {
    const deA = Etiqueta.parse(
      (await crear('dueno', `Ajena ${randomBytes(2).toString('hex')}`)).json,
    );
    const convB = await conversacion(TENANT_B, canalB, null);
    const convA = await conversacion(TENANT_A, canalA, null);

    const patchAjena = await api('bruno', 'PATCH', `/api/v1/etiquetas/${deA.id}`, {
      nombre: 'Robada',
    });
    const patchInexistente = await api('bruno', 'PATCH', `/api/v1/etiquetas/${randomUUID()}`, {
      nombre: 'Robada',
    });
    expect([patchAjena.status, codigo(patchAjena)]).toEqual([404, 'ETIQUETA_NO_ENCONTRADA']);
    expect(patchAjena.json).toEqual(patchInexistente.json);

    const delAjena = await api('bruno', 'DELETE', `/api/v1/etiquetas/${deA.id}`);
    const delInexistente = await api('bruno', 'DELETE', `/api/v1/etiquetas/${randomUUID()}`);
    expect(delAjena.status).toBe(404);
    expect(delAjena.json).toEqual(delInexistente.json);

    // Su conversación, la etiqueta de A: 404 de etiqueta, idéntico al de una inexistente.
    const asignarAjena = await poner('bruno', convB, deA.id);
    const asignarInexistente = await poner('bruno', convB, randomUUID());
    expect(asignarAjena.status).toBe(404);
    expect(asignarAjena.json).toEqual(asignarInexistente.json);
    expect(await admin.conversationLabel.count({ where: { etiquetaId: deA.id } })).toBe(0);

    // La conversación de A, desde B: 404 de conversación, idéntico al de una inexistente.
    const deB = Etiqueta.parse(
      (await crear('bruno', `Propia ${randomBytes(2).toString('hex')}`)).json,
    );
    const convAjena = await poner('bruno', convA, deB.id);
    const convInexistente = await poner('bruno', randomUUID(), deB.id);
    expect([convAjena.status, codigo(convAjena)]).toEqual([404, 'CONVERSACION_NO_ENCONTRADA']);
    expect(convAjena.json).toEqual(convInexistente.json);
    expect((await quitar('bruno', convA, deB.id)).status).toBe(404);

    const intacta = await admin.label.findUniqueOrThrow({ where: { id: deA.id } });
    expect(intacta.nombre).toBe(deA.nombre);
  });

  it('el filtro de la bandeja de B nunca devuelve conversaciones de A, ni con el id de una etiqueta de A', async () => {
    const deA = Etiqueta.parse(
      (await crear('dueno', `Filtro ajeno ${randomBytes(2).toString('hex')}`)).json,
    );
    const convA = await conversacion(TENANT_A, canalA, null);
    await poner('dueno', convA, deA.id);
    const r = await api('bruno', 'GET', `/api/v1/conversaciones?etiquetas=${deA.id}`);
    expect(r.status).toBe(200);
    expect(idsDe(r)).toEqual([]);
  });
});

// ============================================================================================
// R10: el nombre no sale a logs, eventos ni outbox
// ============================================================================================

describe('R10: el nombre de la etiqueta no sale a logs, eventos ni outbox', () => {
  it('con un nombre sensible: crear, duplicar, rechazar, renombrar, poner, quitar, borrar y 404 no lo dejan en ningún log ni en el outbox', async () => {
    registro.length = 0;
    const consola = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    try {
      const e = Etiqueta.parse((await crear('dueno', NOMBRE_SENSIBLE, 'rosa')).json);
      const conv = await conversacion(TENANT_A, canalA, null);

      // Errores que hoy pasan por el filtro global, que escribe `código: mensaje` en el log.
      const duplicada = await crear('dueno', NOMBRE_SENSIBLE.toUpperCase());
      expect(codigo(duplicada)).toBe('ETIQUETA_DUPLICADA');
      const otra = Etiqueta.parse((await crear('dueno', 'Otra etiqueta cualquiera')).json);
      const renombradaAExistente = await api('dueno', 'PATCH', `/api/v1/etiquetas/${otra.id}`, {
        nombre: `  ${NOMBRE_SENSIBLE.toLowerCase()}`,
      });
      expect(codigo(renombradaAExistente)).toBe('ETIQUETA_DUPLICADA');
      const invisible = await crear('dueno', `Marta${cp(0x200b)} Gómez`);
      expect(invisible.status).toBe(400);
      expect(JSON.stringify(invisible.json)).not.toMatch(PATRON_SENSIBLE);

      expect((await poner('dueno', conv, e.id)).status).toBe(200);
      expect((await quitar('dueno', conv, e.id)).status).toBe(200);
      expect((await poner('dueno', conv, e.id)).status).toBe(200);
      expect((await poner('ana', randomUUID(), e.id)).status).toBe(404);
      expect((await api('ana', 'PATCH', `/api/v1/etiquetas/${e.id}`, { nombre: 'x' })).status).toBe(
        403,
      );
      expect(
        (
          await api('dueno', 'PATCH', `/api/v1/etiquetas/${e.id}`, {
            nombre: `${NOMBRE_SENSIBLE} 2`,
          })
        ).status,
      ).toBe(200);
      expect((await api('dueno', 'DELETE', `/api/v1/etiquetas/${e.id}`)).status).toBe(200);
    } finally {
      for (const espia of consola) {
        const salida = espia.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
        registro.push(salida);
        espia.mockRestore();
      }
    }

    expect(registro.join('\n')).not.toMatch(PATRON_SENSIBLE);

    // Ningún evento del outbox de la agencia lleva el nombre.
    const eventos = await admin.outbox.findMany({ where: { tenantId: TENANT_A } });
    expect(eventos.length).toBeGreaterThan(0);
    expect(
      JSON.stringify(eventos, (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v)),
    ).not.toMatch(PATRON_SENSIBLE);
  });
});
