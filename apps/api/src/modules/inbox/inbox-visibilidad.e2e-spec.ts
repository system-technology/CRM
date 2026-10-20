/**
 * Visibilidad de conversaciones dentro de una agencia (`docs/01-producto/12-visibilidad-de-conversaciones.md`),
 * de punta a punta: aplicación ensamblada, HTTP y WebSocket reales, PostgreSQL con RLS y el rol de
 * la API. Una prueba por criterio de aceptación, nombrada con su número (CA1…CA17).
 *
 * Fixture: la agencia A con un **Dueño** (rol con `conversaciones.ver_todas`), **Ana** y **Beto**
 * (rol asesor, sin él); y la agencia B con **Bruno**, para comprobar que el aislamiento ENTRE
 * agencias sigue en pie. Conversaciones: C1 de Ana, C2 de Beto, C3 sin asignar.
 *
 * El relay del outbox corre en el trabajador, que aquí no existe: `relevar()` hace lo mismo que él
 * (vaciar el outbox de la agencia hacia el bus), con el mismo código.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { EVENTO_SOCKET_BANDEJA, EventoBandeja, RUTA_SOCKET_BANDEJA } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { io as clienteIo, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { ContactosDeCrm } from '../crm/infrastructure/puertos-de-crm.prisma.js';
import { PuertoPublicadorDeEventos } from './application/puertos-de-eventos.js';
import { RelevarOutbox } from './application/relevar-outbox.js';
import { TIPO_MENSAJE_RECIBIDO } from './domain/evento-de-dominio.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import { OutboxPrisma } from './infrastructure/outbox.prisma.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const correo = (quien: string): string =>
  `fixture-visibilidad-${randomBytes(3).toString('hex')}-${quien}@fixture-identidad.test`;
type Persona = 'dueno' | 'ana' | 'beto' | 'cata' | 'bruno';
const CORREO: Record<Persona, string> = {
  dueno: correo('dueno'),
  ana: correo('ana'),
  beto: correo('beto'),
  cata: correo('cata'),
  bruno: correo('bruno'),
};
const identidades: Partial<Record<Persona, string>> = {};
/** El id de `usuarios` (la pertenencia a la agencia), que es el que se asigna. */
const U: Record<Persona, string> = { dueno: '', ana: '', beto: '', cata: '', bruno: '' };

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let publicador: PuertoPublicadorDeEventos;
let prismaWebhook: PrismaWebhookService;
let bandeja: BandejaPrisma;
let relevo: RelevarOutbox;
let rolAsesorA = '';
const canal: Record<'A' | 'B', string> = { A: '', B: '' };
const abiertos: Socket[] = [];
const cookies = {} as Record<Persona, string>;

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const rnd = (): number => Math.floor(Math.random() * 250) + 1;

/** Solo recorre las agencias de fixture: la base es compartida. */
class OutboxAcotado extends OutboxPrisma {
  override tenantsParaBarrer(): Promise<string[]> {
    return Promise.resolve([TENANT_A, TENANT_B]);
  }
}

// ----------------------------------------------------------------------------------- fixture

async function agencia(id: string, sufijo: string): Promise<{ canalId: string }> {
  await admin.tenant.create({
    data: { id, slug: `fixture-visibilidad-${id.slice(-12)}`, nombre: `Agencia ${sufijo}` },
  });
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId: id, wabaId: `waba-vis-${randomBytes(4).toString('hex')}`, nombre: 'WABA' },
  });
  const c = await admin.canal.create({
    data: {
      tenantId: id,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  return { canalId: c.id };
}

async function persona(quien: Persona, tenantId: string, rolId: string, activo = true) {
  let identidadId = identidades[quien];
  if (!identidadId) {
    const i = await admin.identidad.create({
      data: { correo: CORREO[quien], nombre: quien, correoVerificado: true },
    });
    await admin.credencial.create({
      data: {
        identidadId: i.id,
        proveedor: 'credential',
        hashContrasena: await hashPassword(CLAVE),
      },
    });
    identidadId = i.id;
    identidades[quien] = identidadId;
  }
  const u = await admin.usuario.create({
    data: { tenantId, identidadId, rolId, correo: CORREO[quien], nombre: quien, activo },
  });
  U[quien] = u.id;
}

interface OpcionesDeConversacion {
  asignadaA: string | null;
  texto: string;
  sinLeer?: number;
  /** Hace cuánto escribió el cliente por última vez. Por defecto, ahora mismo (ventana abierta). */
  clienteHaceMs?: number;
}

/** Una conversación con un mensaje entrante, escrita con el rol propietario. */
async function conversacion(
  tenantId: string,
  canalId: string,
  o: OpcionesDeConversacion,
): Promise<{ id: string; contactoId: string; mensajeId: string }> {
  const contacto = await admin.contacto.create({
    data: {
      tenantId,
      telefonoE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: `Viajero ${randomBytes(2).toString('hex')}`,
    },
  });
  const cuando = new Date(Date.now() - (o.clienteHaceMs ?? 0));
  const c = await admin.conversacion.create({
    data: {
      tenantId,
      canalId,
      contactoId: contacto.id,
      asignadoAId: o.asignadaA,
      ultimoMensajeClienteEn: cuando,
      ultimoMensajeEn: cuando,
      ultimoMensajeTexto: o.texto,
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: o.sinLeer ?? 0,
    },
  });
  const m = await mensajeEntrante(tenantId, c.id, o.texto, cuando);
  return { id: c.id, contactoId: contacto.id, mensajeId: m };
}

async function mensajeEntrante(
  tenantId: string,
  conversacionId: string,
  texto: string,
  cuando = new Date(),
): Promise<string> {
  const m = await admin.mensaje.create({
    data: {
      tenantId,
      conversacionId,
      direccion: 'ENTRANTE',
      tipo: 'TEXTO',
      estado: 'ENTREGADO',
      texto,
      wamid: `wamid.vis.${randomBytes(6).toString('hex')}`,
      ocurridoEn: cuando,
    },
  });
  return m.id;
}

interface Escenario {
  c1: string;
  c2: string;
  c3: string;
  contactoC2: string;
  contactoC3: string;
  textos: { c1: string; c2: string; c3: string };
}

/** C1 de Ana, C2 de Beto, C3 sin asignar. Cada texto lleva una marca única para buscarlo. */
async function escenario(): Promise<Escenario> {
  const marca = randomBytes(3).toString('hex');
  const textos = { c1: `uno-${marca}`, c2: `dos-${marca}`, c3: `tres-${marca}` };
  const c1 = await conversacion(TENANT_A, canal.A, {
    asignadaA: U.ana,
    texto: textos.c1,
    sinLeer: 2,
  });
  const c2 = await conversacion(TENANT_A, canal.A, {
    asignadaA: U.beto,
    texto: textos.c2,
    sinLeer: 5,
  });
  const c3 = await conversacion(TENANT_A, canal.A, {
    asignadaA: null,
    texto: textos.c3,
    sinLeer: 1,
  });
  return {
    c1: c1.id,
    c2: c2.id,
    c3: c3.id,
    contactoC2: c2.contactoId,
    contactoC3: c3.contactoId,
    textos,
  };
}

// ---------------------------------------------------------------------------------------- HTTP

interface Respuesta {
  status: number;
  json: Record<string, unknown>;
}

async function api(
  quien: Persona,
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH',
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

const idsDe = (r: Respuesta): string[] =>
  ((r.json['datos'] as Array<{ id: string }> | undefined) ?? []).map((f) => f.id);

const codigo = (r: Respuesta): unknown => (r.json['error'] as { code?: unknown } | undefined)?.code;

/** El 404 de una conversación que no existe: lo que una ajena tiene que repetir letra por letra. */
async function respuestaDeInexistente(quien: Persona, ruta: (id: string) => string) {
  return api(quien, 'GET', ruta(randomUUID()));
}

// ------------------------------------------------------------------------------------- sockets

function conectar(cookie: string): Promise<Socket> {
  return new Promise((resolver, rechazar) => {
    const socket = clienteIo(base, {
      path: RUTA_SOCKET_BANDEJA,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie },
    });
    abiertos.push(socket);
    socket.once('connect', () => resolver(socket));
    socket.once('connect_error', (e) => rechazar(e));
  });
}

interface Oyente {
  eventos: EventoBandeja[];
  cerrado: () => boolean;
  /** Los eventos que tocan a una conversación. */
  de: (conversacionId: string) => EventoBandeja[];
}

function escuchar(socket: Socket): Oyente {
  const eventos: EventoBandeja[] = [];
  let cerrado = false;
  socket.on(EVENTO_SOCKET_BANDEJA, (e: unknown) => eventos.push(EventoBandeja.parse(e)));
  socket.on('disconnect', () => {
    cerrado = true;
  });
  return {
    eventos,
    cerrado: () => cerrado,
    de: (id) =>
      eventos.filter((e) =>
        e.tipo === 'CONVERSACION_ACTUALIZADA' ? e.conversacion.id === id : e.conversacionId === id,
      ),
  };
}

async function hasta(condicion: () => boolean, ms = 4000): Promise<void> {
  for (let t = 0; t < ms && !condicion(); t += 25) await dormir(25);
}

/** Lo que haría el relay del trabajador: el outbox de la agencia, al bus. */
async function relevar(tenantId = TENANT_A): Promise<void> {
  await relevo.vaciar(tenantId);
}

/** Entra un mensaje del cliente en una conversación y se publica su evento, como el relay. */
async function entraMensaje(conversacionId: string, texto: string): Promise<void> {
  const id = await mensajeEntrante(TENANT_A, conversacionId, texto);
  await publicador.publicar({
    id: String(Math.floor(Math.random() * 1e9)),
    tipo: TIPO_MENSAJE_RECIBIDO,
    tenantId: TENANT_A,
    agregadoId: id,
    payload: {},
  });
}

async function asignadaA(id: string): Promise<string | null> {
  const f = await admin.conversacion.findUniqueOrThrow({
    where: { id },
    select: { asignadoAId: true },
  });
  return f.asignadoAId;
}

// -------------------------------------------------------------------------------- arranque

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  canal.A = (await agencia(TENANT_A, 'A')).canalId;
  canal.B = (await agencia(TENANT_B, 'B')).canalId;

  const rolDueno = await admin.rol.create({
    data: {
      tenantId: TENANT_A,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['conversaciones.ver_todas', 'usuarios.administrar'],
    },
  });
  rolAsesorA = (
    await admin.rol.create({
      data: { tenantId: TENANT_A, nombre: 'Asesor', clave: 'ASESOR', permisos: [] },
    })
  ).id;
  // El rol de B TIENE `ver_todas`: aun así Bruno no puede ver nada de la agencia A.
  const rolB = await admin.rol.create({
    data: {
      tenantId: TENANT_B,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['conversaciones.ver_todas', 'usuarios.administrar'],
    },
  });
  await persona('dueno', TENANT_A, rolDueno.id);
  await persona('ana', TENANT_A, rolAsesorA);
  await persona('beto', TENANT_A, rolAsesorA);
  await persona('cata', TENANT_A, rolAsesorA, false);
  await persona('bruno', TENANT_B, rolB.id);

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
  publicador = app.get(PuertoPublicadorDeEventos);

  prismaWebhook = new PrismaWebhookService();
  await prismaWebhook.onModuleInit();
  bandeja = new BandejaPrisma(prismaWebhook, new ContactosDeCrm());
  relevo = new RelevarOutbox(new OutboxAcotado(prismaWebhook), publicador);

  for (const p of ['dueno', 'ana', 'beto', 'bruno'] as const) cookies[p] = await iniciarSesion(p);
});

afterAll(async () => {
  for (const s of abiertos) s.close();
  await app?.close();
  await prismaWebhook?.onModuleDestroy();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
      await adminPg.query('DELETE FROM identidades WHERE id = ANY($1::uuid[])', [
        Object.values(identidades),
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

// ============================================================================================
// Lectura: la bandeja, el hilo, las notas, la media, la búsqueda y los contadores
// ============================================================================================

describe('lectura', () => {
  let e: Escenario;
  beforeAll(async () => {
    e = await escenario();
  });

  it('CA1: Ana consulta la bandeja con filtro TODAS y recibe exactamente C1 y C3', async () => {
    const r = await api('ana', 'GET', '/api/v1/conversaciones?filtro=TODAS');
    expect(r.status).toBe(200);
    expect(idsDe(r).sort()).toEqual([e.c1, e.c3].sort());
  });

  it('CA2: el Dueño consulta la bandeja con filtro TODAS y recibe C1, C2 y C3', async () => {
    const r = await api('dueno', 'GET', '/api/v1/conversaciones?filtro=TODAS');
    expect(r.status).toBe(200);
    expect(idsDe(r).sort()).toEqual([e.c1, e.c2, e.c3].sort());
  });

  it('CA3: Ana pide el detalle, los mensajes, las notas o la media de C2 y recibe el mismo 404 que un id inexistente', async () => {
    const rutas: Array<(id: string) => string> = [
      (id) => `/api/v1/conversaciones/${id}`,
      (id) => `/api/v1/conversaciones/${id}/mensajes`,
      (id) => `/api/v1/conversaciones/${id}/notas`,
      (id) => `/api/v1/conversaciones/${id}/adjuntos/${randomUUID()}`,
    ];
    for (const ruta of rutas) {
      const ajena = await api('ana', 'GET', ruta(e.c2));
      const inexistente = await respuestaDeInexistente('ana', ruta);
      expect(ajena.status).toBe(404);
      expect(codigo(ajena)).toBe('CONVERSACION_NO_ENCONTRADA');
      // No confirma que exista: la respuesta es idéntica.
      expect(ajena).toEqual(inexistente);
    }
  });

  it('CA3: y las propias y las de la cola común sí se leen', async () => {
    for (const id of [e.c1, e.c3]) {
      expect((await api('ana', 'GET', `/api/v1/conversaciones/${id}`)).status).toBe(200);
      expect((await api('ana', 'GET', `/api/v1/conversaciones/${id}/mensajes`)).status).toBe(200);
      expect((await api('ana', 'GET', `/api/v1/conversaciones/${id}/notas`)).status).toBe(200);
    }
  });

  it('CA3: la media de una conversación ajena es 404 de conversación; la de una propia sin ese adjunto, de adjunto', async () => {
    const mensaje = await admin.mensaje.findFirstOrThrow({ where: { conversacionId: e.c2 } });
    const adjunto = await admin.adjunto.create({
      data: {
        tenantId: TENANT_A,
        mensajeId: mensaje.id,
        tipo: 'DOCUMENTO',
        mediaIdMeta: 'media-1',
        nombreArchivo: 'itinerario.pdf',
        mimeType: 'application/pdf',
      },
    });
    const ajena = await api('ana', 'GET', `/api/v1/conversaciones/${e.c2}/adjuntos/${adjunto.id}`);
    expect(ajena.status).toBe(404);
    expect(codigo(ajena)).toBe('CONVERSACION_NO_ENCONTRADA');

    const dueno = await api(
      'dueno',
      'GET',
      `/api/v1/conversaciones/${e.c2}/adjuntos/${adjunto.id}`,
    );
    expect(dueno.status).toBe(200);
    expect(dueno.json).toMatchObject({ nombreArchivo: 'itinerario.pdf', descargado: false });

    // Una conversación que Ana sí ve, pero con un adjunto que cuelga de otra.
    const otro = await api('ana', 'GET', `/api/v1/conversaciones/${e.c1}/adjuntos/${adjunto.id}`);
    expect(otro.status).toBe(404);
    expect(codigo(otro)).toBe('ADJUNTO_NO_ENCONTRADO');
  });

  it('CA4: Ana busca un texto que solo aparece en un mensaje de C2 y no obtiene resultados', async () => {
    const buscar = encodeURIComponent(e.textos.c2);
    const ana = await api('ana', 'GET', `/api/v1/conversaciones?filtro=TODAS&buscar=${buscar}`);
    expect(ana.status).toBe(200);
    expect(idsDe(ana)).toEqual([]);
    // El mismo texto sí aparece para quien ve C2: la búsqueda funciona, no está rota.
    const dueno = await api('dueno', 'GET', `/api/v1/conversaciones?filtro=TODAS&buscar=${buscar}`);
    expect(idsDe(dueno)).toEqual([e.c2]);
    // Y lo suyo sí lo encuentra.
    const suyo = await api(
      'ana',
      'GET',
      `/api/v1/conversaciones?filtro=TODAS&buscar=${encodeURIComponent(e.textos.c1)}`,
    );
    expect(idsDe(suyo)).toEqual([e.c1]);
  });

  it('CA4: la vista previa de C2 tampoco sale en ninguna pestaña de la bandeja de Ana', async () => {
    for (const filtro of ['TODAS', 'MIAS', 'SIN_ASIGNAR', 'SIN_LEER', 'SLA_VENCIDO']) {
      const r = await api('ana', 'GET', `/api/v1/conversaciones?filtro=${filtro}`);
      expect(JSON.stringify(r.json)).not.toContain(e.textos.c2);
      expect(idsDe(r)).not.toContain(e.c2);
    }
  });

  it('CA5: los contadores de sin leer de Ana no suman los mensajes de C2', async () => {
    const ana = await api('ana', 'GET', '/api/v1/conversaciones/contadores');
    expect(ana.status).toBe(200);
    // C1 (2) + C3 (1); los 5 de C2 no cuentan.
    expect(ana.json).toMatchObject({
      todas: 2,
      mias: 1,
      sinAsignar: 1,
      conversacionesSinLeer: 2,
      mensajesSinLeer: 3,
    });
    const dueno = await api('dueno', 'GET', '/api/v1/conversaciones/contadores');
    expect(dueno.json).toMatchObject({ todas: 3, sinAsignar: 1, mensajesSinLeer: 8 });
  });

  it('la ficha del contacto no deja pasar una nota escrita en una conversación ajena', async () => {
    const nota = `nota-secreta-${randomBytes(3).toString('hex')}`;
    expect(
      (await api('beto', 'POST', `/api/v1/conversaciones/${e.c2}/notas`, { texto: nota })).status,
    ).toBe(201);

    const ana = await api('ana', 'GET', `/api/v1/crm/contactos/${e.contactoC2}/ficha`);
    expect(ana.status).toBe(200);
    expect(JSON.stringify(ana.json)).not.toContain(nota);
    const dueno = await api('dueno', 'GET', `/api/v1/crm/contactos/${e.contactoC2}/ficha`);
    expect(JSON.stringify(dueno.json)).toContain(nota);

    // Lo que SÍ se ve sigue saliendo: una nota del panel del contacto (sin hilo) y una escrita en
    // una conversación de la cola común.
    const delPanel = `nota-del-panel-${randomBytes(3).toString('hex')}`;
    await admin.notaInterna.create({
      data: { tenantId: TENANT_A, contactoId: e.contactoC2, autorId: U.dueno, texto: delPanel },
    });
    const conPanel = await api('ana', 'GET', `/api/v1/crm/contactos/${e.contactoC2}/ficha`);
    expect(JSON.stringify(conPanel.json)).toContain(delPanel);

    const deLaCola = `nota-de-la-cola-${randomBytes(3).toString('hex')}`;
    expect(
      (await api('ana', 'POST', `/api/v1/conversaciones/${e.c3}/notas`, { texto: deLaCola }))
        .status,
    ).toBe(201);
    const ficha3 = await api('beto', 'GET', `/api/v1/crm/contactos/${e.contactoC3}/ficha`);
    expect(JSON.stringify(ficha3.json)).toContain(deLaCola);
  });

  it('una consulta con un cursor roto es 422, no un 500', async () => {
    const r = await api('ana', 'GET', '/api/v1/conversaciones?cursor=basura');
    expect(r.status).toBe(422);
    expect(codigo(r)).toBe('CURSOR_INVALIDO');
  });

  it('la paginación de la bandeja respeta la visibilidad página a página', async () => {
    const primera = await api('dueno', 'GET', '/api/v1/conversaciones?limite=2');
    const pageInfo = primera.json['pageInfo'] as { nextCursor: string | null; hasMore: boolean };
    expect(idsDe(primera)).toHaveLength(2);
    expect(pageInfo.hasMore).toBe(true);
    const segunda = await api(
      'dueno',
      'GET',
      `/api/v1/conversaciones?limite=2&cursor=${pageInfo.nextCursor ?? ''}`,
    );
    expect(idsDe(segunda).filter((id) => idsDe(primera).includes(id))).toEqual([]);
  });
});

// ============================================================================================
// Aislamiento ENTRE agencias: tiene que seguir en verde con la visibilidad dentro de la agencia
// ============================================================================================

describe('aislamiento entre agencias', () => {
  it('Bruno (otra agencia, con ver_todas) no ve nada de A: ni la lista, ni el hilo, ni los contadores', async () => {
    const e = await escenario();
    const enB = await conversacion(TENANT_B, canal.B, { asignadaA: null, texto: 'solo en B' });

    const lista = await api('bruno', 'GET', '/api/v1/conversaciones?filtro=TODAS');
    expect(idsDe(lista)).toEqual([enB.id]);
    expect(JSON.stringify(lista.json)).not.toContain(e.textos.c3);

    for (const id of [e.c1, e.c2, e.c3]) {
      const r = await api('bruno', 'GET', `/api/v1/conversaciones/${id}`);
      expect(r.status).toBe(404);
      expect(codigo(r)).toBe('CONVERSACION_NO_ENCONTRADA');
      // Tampoco puede actuar sobre ellas.
      expect(
        (await api('bruno', 'PUT', `/api/v1/conversaciones/${id}/asignacion`, { usuarioId: null }))
          .status,
      ).toBe(404);
    }
    const contadores = await api('bruno', 'GET', '/api/v1/conversaciones/contadores');
    expect(contadores.json).toMatchObject({ todas: 1 });
    // Y el dueño de A no ve la de B.
    const dueno = await api('dueno', 'GET', '/api/v1/conversaciones?filtro=TODAS');
    expect(idsDe(dueno)).not.toContain(enB.id);
  });
});

// ============================================================================================
// Tiempo real
// ============================================================================================

describe('tiempo real', () => {
  it('CA6: entra un mensaje en C2: Beto y el Dueño lo reciben; Ana no recibe ningún evento de C2', async () => {
    const e = await escenario();
    const [ana, beto, dueno] = await Promise.all(
      (['ana', 'beto', 'dueno'] as const).map(async (p) => escuchar(await conectar(cookies[p]))),
    );
    await entraMensaje(e.c2, 'mensaje nuevo en C2');
    await hasta(() => (beto?.de(e.c2).length ?? 0) >= 1 && (dueno?.de(e.c2).length ?? 0) >= 1);
    await dormir(300);

    expect(beto?.de(e.c2).map((x) => x.tipo)).toEqual(['MENSAJE_NUEVO']);
    expect(dueno?.de(e.c2).map((x) => x.tipo)).toEqual(['MENSAJE_NUEVO']);
    expect(ana?.de(e.c2)).toEqual([]);
    expect(JSON.stringify(ana?.eventos)).not.toContain('mensaje nuevo en C2');
  });

  it('CA7: entra un mensaje en C3: Ana, Beto y el Dueño reciben el evento', async () => {
    const e = await escenario();
    const oyentes = await Promise.all(
      (['ana', 'beto', 'dueno'] as const).map(async (p) => escuchar(await conectar(cookies[p]))),
    );
    await entraMensaje(e.c3, 'mensaje nuevo en C3');
    await hasta(() => oyentes.every((o) => o.de(e.c3).length >= 1));
    for (const o of oyentes) expect(o.de(e.c3).map((x) => x.tipo)).toEqual(['MENSAJE_NUEVO']);
  });

  it('CA16: con ver_todas en el rol asesor, Ana ve C2 y su socket recibe sus eventos sin reconectar; al quitarlo, deja de verla', async () => {
    const e = await escenario();
    const socket = await conectar(cookies.ana);
    const ana = escuchar(socket);

    expect((await api('ana', 'GET', `/api/v1/conversaciones/${e.c2}`)).status).toBe(404);
    await admin.rol.update({
      where: { id: rolAsesorA },
      data: { permisos: ['conversaciones.ver_todas'] },
    });
    try {
      // La siguiente petición, con la misma sesión.
      expect((await api('ana', 'GET', `/api/v1/conversaciones/${e.c2}`)).status).toBe(200);
      expect(idsDe(await api('ana', 'GET', '/api/v1/conversaciones?filtro=TODAS'))).toContain(e.c2);

      await entraMensaje(e.c2, 'con permiso');
      await hasta(() => ana.de(e.c2).length >= 1);
      expect(ana.de(e.c2).map((x) => x.tipo)).toEqual(['MENSAJE_NUEVO']);
      expect(ana.cerrado()).toBe(false);
    } finally {
      await admin.rol.update({ where: { id: rolAsesorA }, data: { permisos: [] } });
    }

    // Al quitarlo, igual.
    expect((await api('ana', 'GET', `/api/v1/conversaciones/${e.c2}`)).status).toBe(404);
    const antes = ana.de(e.c2).length;
    await entraMensaje(e.c2, 'sin permiso');
    await dormir(400);
    expect(ana.de(e.c2)).toHaveLength(antes);
  });
});

// ============================================================================================
// Asignación
// ============================================================================================

describe('asignación', () => {
  it('CA8: Ana envía el primer texto en C3: queda asignada a Ana; Beto deja de verla en REST y de recibir sus eventos', async () => {
    const e = await escenario();
    const beto = escuchar(await conectar(cookies.beto));
    expect((await api('beto', 'GET', `/api/v1/conversaciones/${e.c3}`)).status).toBe(200);

    const r = await api('ana', 'POST', `/api/v1/conversaciones/${e.c3}/mensajes`, {
      texto: 'Hola, soy Ana',
      claveIdempotencia: randomUUID(),
    });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      direccion: 'SALIENTE',
      estado: 'PENDIENTE',
      texto: 'Hola, soy Ana',
    });
    expect(await asignadaA(e.c3)).toBe(U.ana);

    // Beto: 404 en REST, y la fila desaparece de su bandeja.
    expect((await api('beto', 'GET', `/api/v1/conversaciones/${e.c3}`)).status).toBe(404);
    expect(idsDe(await api('beto', 'GET', '/api/v1/conversaciones?filtro=TODAS'))).not.toContain(
      e.c3,
    );

    // Y deja de recibir sus eventos: solo la retirada, ningún mensaje nuevo.
    await relevar();
    await hasta(() => beto.de(e.c3).length >= 1);
    expect(beto.de(e.c3).map((x) => x.tipo)).toEqual(['CONVERSACION_RETIRADA']);
    await entraMensaje(e.c3, 'el cliente responde');
    await dormir(400);
    expect(beto.de(e.c3).map((x) => x.tipo)).toEqual(['CONVERSACION_RETIRADA']);
  });

  it('CA9: Ana deja una nota interna en C3 o la marca como leída: C3 sigue sin asignar', async () => {
    const e = await escenario();
    const nota = await api('ana', 'POST', `/api/v1/conversaciones/${e.c3}/notas`, {
      texto: 'Pidió cotización a Cancún',
    });
    expect(nota.status).toBe(201);
    expect(await asignadaA(e.c3)).toBeNull();

    const leida = await api('ana', 'POST', `/api/v1/conversaciones/${e.c3}/leida`);
    expect(leida.status).toBe(200);
    expect(await asignadaA(e.c3)).toBeNull();

    // Cambiar el estado tampoco asigna.
    const estado = await api('ana', 'PATCH', `/api/v1/conversaciones/${e.c3}/estado`, {
      estado: 'EN_ESPERA',
    });
    expect(estado.status).toBe(200);
    expect(await asignadaA(e.c3)).toBeNull();

    // Y la nota quedó en el hilo.
    const notas = await api('ana', 'GET', `/api/v1/conversaciones/${e.c3}/notas`);
    expect(JSON.stringify(notas.json)).toContain('Pidió cotización a Cancún');
  });

  it('CA10: el Dueño responde en C1: C1 sigue asignada a Ana', async () => {
    const e = await escenario();
    const r = await api('dueno', 'POST', `/api/v1/conversaciones/${e.c1}/mensajes`, {
      texto: 'Aquí el dueño',
      claveIdempotencia: randomUUID(),
    });
    expect(r.status).toBe(201);
    expect(await asignadaA(e.c1)).toBe(U.ana);
  });

  it('CA11: Ana reasigna C1 a Beto: Ana recibe 404 en su siguiente petición y su bandeja abierta retira la fila en menos de 5 s', async () => {
    const e = await escenario();
    const ana = escuchar(await conectar(cookies.ana));

    const t0 = Date.now();
    const r = await api('ana', 'PUT', `/api/v1/conversaciones/${e.c1}/asignacion`, {
      usuarioId: U.beto,
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: e.c1, asignadoAId: U.beto });

    expect((await api('ana', 'GET', `/api/v1/conversaciones/${e.c1}`)).status).toBe(404);
    expect((await api('beto', 'GET', `/api/v1/conversaciones/${e.c1}`)).status).toBe(200);

    await relevar();
    await hasta(() => ana.de(e.c1).length >= 1, 5000);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(ana.de(e.c1)).toEqual([{ tipo: 'CONVERSACION_RETIRADA', conversacionId: e.c1 }]);
  });

  it('CA12: Ana intenta asignar C2 (la de Beto) a sí misma y recibe 404', async () => {
    const e = await escenario();
    const r = await api('ana', 'PUT', `/api/v1/conversaciones/${e.c2}/asignacion`, {
      usuarioId: U.ana,
    });
    expect(r.status).toBe(404);
    expect(codigo(r)).toBe('CONVERSACION_NO_ENCONTRADA');
    expect(await asignadaA(e.c2)).toBe(U.beto);
  });

  it('CA13: Ana suelta C1 (asignación nula): Beto la ve en su bandeja', async () => {
    const e = await escenario();
    expect(idsDe(await api('beto', 'GET', '/api/v1/conversaciones?filtro=TODAS'))).not.toContain(
      e.c1,
    );
    const r = await api('ana', 'PUT', `/api/v1/conversaciones/${e.c1}/asignacion`, {
      usuarioId: null,
    });
    expect(r.status).toBe(200);
    expect(await asignadaA(e.c1)).toBeNull();
    expect(idsDe(await api('beto', 'GET', '/api/v1/conversaciones?filtro=TODAS'))).toContain(e.c1);
  });

  it('tomar: cualquiera se asigna una conversación de la cola común, y repetirlo no cambia nada', async () => {
    const e = await escenario();
    const una = await api('beto', 'PUT', `/api/v1/conversaciones/${e.c3}/asignacion`, {
      usuarioId: U.beto,
    });
    expect(una.status).toBe(200);
    expect(await asignadaA(e.c3)).toBe(U.beto);
    const otra = await api('beto', 'PUT', `/api/v1/conversaciones/${e.c3}/asignacion`, {
      usuarioId: U.beto,
    });
    expect(otra.status).toBe(200);
  });

  it('CA14: asignar a un usuario de otra agencia, dado de baja o inexistente se rechaza y la asignación no cambia', async () => {
    const e = await escenario();
    const destinos = [U.bruno, U.cata, randomUUID()];
    for (const usuarioId of destinos) {
      const r = await api('ana', 'PUT', `/api/v1/conversaciones/${e.c1}/asignacion`, { usuarioId });
      expect(r.status).toBe(422);
      expect(codigo(r)).toBe('USUARIO_NO_ASIGNABLE');
      expect(await asignadaA(e.c1)).toBe(U.ana);
    }
    // Un cuerpo que no es un uuid ni nulo ni siquiera llega al caso de uso.
    const malo = await api('ana', 'PUT', `/api/v1/conversaciones/${e.c1}/asignacion`, {
      usuarioId: 'beto',
    });
    expect(malo.status).toBe(400);
  });

  it('CA15: se da de baja a Beto: C2 queda sin asignar y Ana la ve', async () => {
    const e = await escenario();
    const ana = escuchar(await conectar(cookies.ana));
    expect((await api('ana', 'GET', `/api/v1/conversaciones/${e.c2}`)).status).toBe(404);

    const baja = await api('dueno', 'POST', `/api/v1/identidad/miembros/${U.beto}/baja`);
    expect(baja.status).toBe(200);
    expect(await asignadaA(e.c2)).toBeNull();
    expect((await api('ana', 'GET', `/api/v1/conversaciones/${e.c2}`)).status).toBe(200);
    expect(idsDe(await api('ana', 'GET', '/api/v1/conversaciones?filtro=TODAS'))).toContain(e.c2);

    // Su bandeja abierta la ve aparecer, sin recargar.
    await relevar();
    await hasta(() => ana.de(e.c2).length >= 1);
    expect(ana.de(e.c2).map((x) => x.tipo)).toEqual(['CONVERSACION_ACTUALIZADA']);

    // Repetir la baja no falla ni cambia nada; sin permiso o contra uno mismo no se puede.
    expect((await api('dueno', 'POST', `/api/v1/identidad/miembros/${U.beto}/baja`)).status).toBe(
      200,
    );
    expect((await api('ana', 'POST', `/api/v1/identidad/miembros/${U.beto}/baja`)).status).toBe(
      403,
    );
    expect((await api('dueno', 'POST', `/api/v1/identidad/miembros/${U.dueno}/baja`)).status).toBe(
      409,
    );
    // Un miembro de otra agencia no existe aquí.
    expect((await api('dueno', 'POST', `/api/v1/identidad/miembros/${U.bruno}/baja`)).status).toBe(
      404,
    );
  });

  it('CA17: una conversación nueva que abre el webhook entra sin asignar y la ven todos los miembros', async () => {
    const r = await bandeja.registrarEntrante(TENANT_A, canal.A, {
      wamid: `wamid.vis.${randomUUID()}`,
      deTelefono: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombrePerfil: 'Viajera nueva',
      instante: new Date(),
      tipo: 'TEXTO',
      texto: 'Quiero ir a Cartagena',
      medioId: null,
      nombreArchivo: null,
      mimeType: null,
      respondeA: null,
      reaccionaA: null,
    });
    expect(r).toBe('CREADO');

    // Beto está dado de baja por CA15: miran Ana y el dueño; y la fila dice «sin asignar».
    for (const quien of ['ana', 'dueno'] as const) {
      const lista = await api(quien, 'GET', '/api/v1/conversaciones?buscar=Cartagena');
      const filas = lista.json['datos'] as Array<{ asignadoAId: string | null }>;
      expect(filas).toHaveLength(1);
      expect(filas[0]?.asignadoAId).toBeNull();
    }
  });
});

// ============================================================================================
// Responder: idempotencia y ventana (lo que ya existía como regla y ahora tiene ruta)
// ============================================================================================

describe('responder', () => {
  it('la misma clave de idempotencia produce un solo mensaje', async () => {
    const e = await escenario();
    const clave = randomUUID();
    const cuerpo = { texto: 'Una sola vez', claveIdempotencia: clave };
    const a = await api('ana', 'POST', `/api/v1/conversaciones/${e.c1}/mensajes`, cuerpo);
    const b = await api('ana', 'POST', `/api/v1/conversaciones/${e.c1}/mensajes`, cuerpo);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json['id']).toBe(a.json['id']);
    expect(await admin.mensaje.count({ where: { claveIdempotencia: clave } })).toBe(1);

    // La misma clave en OTRA conversación no es un reintento: es un conflicto.
    const otra = await api('ana', 'POST', `/api/v1/conversaciones/${e.c3}/mensajes`, cuerpo);
    expect(otra.status).toBe(409);
    expect(codigo(otra)).toBe('CLAVE_DE_IDEMPOTENCIA_EN_USO');
  });

  it('fuera de la ventana de 24 h no sale texto libre: 409 VENTANA_CERRADA y nada se guarda', async () => {
    const vieja = await conversacion(TENANT_A, canal.A, {
      asignadaA: U.ana,
      texto: 'hace dos días',
      clienteHaceMs: 48 * 60 * 60 * 1000,
    });
    const clave = randomUUID();
    const r = await api('ana', 'POST', `/api/v1/conversaciones/${vieja.id}/mensajes`, {
      texto: 'tarde',
      claveIdempotencia: clave,
    });
    expect(r.status).toBe(409);
    expect(codigo(r)).toBe('VENTANA_CERRADA');
    expect(await admin.mensaje.count({ where: { claveIdempotencia: clave } })).toBe(0);
  });

  it('el evento del outbox lleva solo identificadores: ni el texto ni el teléfono', async () => {
    const e = await escenario();
    const texto = `pasaporte-${randomBytes(4).toString('hex')}`;
    expect(
      (
        await api('ana', 'POST', `/api/v1/conversaciones/${e.c1}/mensajes`, {
          texto,
          claveIdempotencia: randomUUID(),
        })
      ).status,
    ).toBe(201);
    const filas = await adminPg.query<{ payload: unknown }>(
      `SELECT payload FROM outbox WHERE tenant_id = $1 AND agregado_id = $2`,
      [TENANT_A, e.c1],
    );
    expect(JSON.stringify(filas.rows)).not.toContain(texto);
    const mensajes = await adminPg.query<{ payload: unknown }>(
      `SELECT payload FROM outbox WHERE tenant_id = $1 AND tipo_evento = 'inbox.mensaje_saliente_creado'`,
      [TENANT_A],
    );
    expect(JSON.stringify(mensajes.rows)).not.toContain(texto);
  });
});
