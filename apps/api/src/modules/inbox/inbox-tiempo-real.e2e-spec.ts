/**
 * La bandeja en vivo (Socket.IO), de punta a punta con el bus en memoria: sin Redis.
 *
 * Aplicación ensamblada, HTTP y WebSocket reales, PostgreSQL con RLS. Los eventos entran por el
 * puerto de publicación (el mismo que usa el relay del trabajador) y el gateway los lee de la base
 * bajo RLS. El recorrido completo con el trabajador y Redis está en
 * `inbox-tiempo-real-redis.e2e-spec.ts`.
 *
 * Estas son las cuatro pruebas que ADR-0011 dejó como `it.todo`, más las que las rodean:
 *   · con la cookie de A no se reciben eventos de B;
 *   · con la sesión revocada, el socket se cierra en la siguiente revalidación;
 *   · con la membresía dada de baja, igual;
 *   · pedir la sala de otra agencia es un rechazo, y no une nada.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  EVENTO_SOCKET_BANDEJA,
  EVENTO_SOCKET_CIERRE,
  EVENTO_SOCKET_UNIRSE,
  EventoBandeja,
  RespuestaDeUnirse,
  RUTA_SOCKET_BANDEJA,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { io as clienteIo, type Socket } from 'socket.io-client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { cifradoDePrueba } from '../../shared/cifrado/cifrado-de-prueba.js';
import { columnasDeTexto } from '../../shared/cifrado/columnas-de-prisma.js';
import { COLUMNAS_CIFRADAS } from '../../shared/cifrado/puerto-de-cifrado.js';
import { PuertoPublicadorDeEventos } from './application/puertos-de-eventos.js';
import {
  salaDeTenant,
  salaDeUsuario,
  TIPO_ACCESO_REVOCADO,
  TIPO_MENSAJE_RECIBIDO,
} from './domain/evento-de-dominio.js';
import { BandejaEnVivoGateway } from './interface/bandeja-en-vivo.gateway.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const TENANT_C = idDeTenant();
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const correo = (quien: string): string =>
  `fixture-aislamiento-vivo-${randomBytes(3).toString('hex')}-${quien}@fixture-identidad.test`;
const C = { ana: correo('ana'), beto: correo('beto'), dani: correo('dani'), cami: correo('cami') };
const identidades: Record<string, string> = {};

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let publicador: PuertoPublicadorDeEventos;
let gateway: BandejaEnVivoGateway;
const mensajeDe: Record<'A' | 'B', string> = { A: '', B: '' };
const abiertos: Socket[] = [];

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const rnd = (): number => Math.floor(Math.random() * 250) + 1;

async function agencia(id: string, sufijo: string, estado: 'ACTIVO' | 'SUSPENDIDO' = 'ACTIVO') {
  await admin.tenant.create({
    data: {
      id,
      slug: `fixture-aislamiento-vivo-${id.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
      estado,
    },
  });
  const rol = await admin.rol.create({
    data: { tenantId: id, nombre: 'Asesor', clave: 'ASESOR', permisos: [] },
  });
  return rol.id;
}

async function persona(quien: keyof typeof C, tenantId: string, rolId: string) {
  let id = identidades[quien];
  if (!id) {
    const i = await admin.identidad.create({
      data: { correo: C[quien], nombre: quien, correoVerificado: true },
    });
    await admin.credencial.create({
      data: {
        identidadId: i.id,
        proveedor: 'credential',
        hashContrasena: await hashPassword(CLAVE),
      },
    });
    id = i.id;
    identidades[quien] = id;
  }
  await admin.usuario.create({
    data: { tenantId, identidadId: id, rolId, correo: C[quien], nombre: quien },
  });
}

/** Una conversación y un mensaje entrante en la agencia, escritos con el rol propietario. */
async function mensajeEnAgencia(tenantId: string, texto: string): Promise<string> {
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId, wabaId: `waba-vivo-${randomBytes(4).toString('hex')}`, nombre: 'WABA' },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  const contacto = await admin.contacto.create({
    data: {
      tenantId,
      telefonoE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: 'Viajero',
    },
  });
  const conversacion = await admin.conversacion.create({
    data: { tenantId, canalId: canal.id, contactoId: contacto.id },
  });
  const mensajeId = randomUUID();
  const mensaje = await admin.mensaje.create({
    data: {
      id: mensajeId,
      tenantId,
      conversacionId: conversacion.id,
      direccion: 'ENTRANTE',
      tipo: 'TEXTO',
      estado: 'ENTREGADO',
      ...columnasDeTexto(
        cifradoDePrueba().cifrar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, tenantId, mensajeId, texto),
      ),
      wamid: `wamid.vivo.${randomBytes(6).toString('hex')}`,
      ocurridoEn: new Date(),
    },
  });
  return mensaje.id;
}

/** Inicia sesión por HTTP y devuelve el valor de la cabecera `Cookie`. */
async function iniciarSesion(quien: keyof typeof C): Promise<string> {
  const r = await fetch(new URL('/api/v1/auth/sign-in/email', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    body: JSON.stringify({ correo: C[quien], contrasena: CLAVE }),
  });
  expect(r.status).toBe(200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

interface OpcionesDeConexion {
  cabeceras?: Record<string, string>;
  auth?: Record<string, unknown>;
  query?: Record<string, string>;
}

/** Conecta y espera al `connect`, o rechaza con el mensaje del `connect_error`. */
function conectar(cookie: string | null, o: OpcionesDeConexion = {}): Promise<Socket> {
  return new Promise((resolver, rechazar) => {
    const socket = clienteIo(base, {
      path: RUTA_SOCKET_BANDEJA,
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { ...(cookie ? { cookie } : {}), ...o.cabeceras },
      ...(o.auth ? { auth: o.auth } : {}),
      ...(o.query ? { query: o.query } : {}),
    });
    abiertos.push(socket);
    socket.once('connect', () => resolver(socket));
    socket.once('connect_error', (e) => rechazar(e));
  });
}

/** Acumula todo lo que el socket reciba, para afirmar también lo que NO llega. */
function escuchar(socket: Socket): {
  eventos: unknown[];
  cierres: unknown[];
  cerrado: () => boolean;
} {
  const eventos: unknown[] = [];
  const cierres: unknown[] = [];
  let cerrado = false;
  socket.on(EVENTO_SOCKET_BANDEJA, (e: unknown) => eventos.push(e));
  socket.on(EVENTO_SOCKET_CIERRE, (c: unknown) => cierres.push(c));
  socket.on('disconnect', () => {
    cerrado = true;
  });
  return { eventos, cierres, cerrado: () => cerrado };
}

async function hasta(condicion: () => boolean, ms = 3000): Promise<void> {
  for (let t = 0; t < ms && !condicion(); t += 25) await dormir(25);
}

const evento = (tenantId: string, mensajeId: string) => ({
  id: String(Math.floor(Math.random() * 1e9)),
  tipo: TIPO_MENSAJE_RECIBIDO,
  tenantId,
  agregadoId: mensajeId,
  payload: {},
});

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  const rolA = await agencia(TENANT_A, 'A');
  const rolB = await agencia(TENANT_B, 'B');
  const rolC = await agencia(TENANT_C, 'C');
  await persona('ana', TENANT_A, rolA);
  await persona('beto', TENANT_B, rolB);
  await persona('dani', TENANT_C, rolC);
  // Cami está en A y en B: no tiene agencia activa hasta que elige una.
  await persona('cami', TENANT_A, rolA);
  await persona('cami', TENANT_B, rolB);
  mensajeDe.A = await mensajeEnAgencia(TENANT_A, 'Consulta para la agencia A');
  mensajeDe.B = await mensajeEnAgencia(TENANT_B, 'Consulta para la agencia B');

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
  publicador = app.get(PuertoPublicadorDeEventos);
  gateway = app.get(BandejaEnVivoGateway);
});

afterAll(async () => {
  for (const s of abiertos) s.close();
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B, TENANT_C]);
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

describe('el handshake (pasos 3 y 4 de ADR-0011)', () => {
  it('sin cookie, se rechaza', async () => {
    await expect(conectar(null)).rejects.toThrow('NO_AUTORIZADO:SIN_SESION');
  });

  it('la cabecera de desarrollo no existe aquí: con APP_ENV=local tampoco entra', async () => {
    expect(process.env['APP_ENV']).toBe('local');
    await expect(conectar(null, { cabeceras: { 'x-dev-tenant-id': TENANT_A } })).rejects.toThrow(
      'NO_AUTORIZADO:SIN_SESION',
    );
  });

  it('una cookie falsa se rechaza', async () => {
    await expect(conectar('__Secure-viajapro.session_token=falso.firma')).rejects.toThrow(
      'NO_AUTORIZADO:SIN_SESION',
    );
  });

  it('con una sesión sin agencia activa, se rechaza', async () => {
    const cookie = await iniciarSesion('cami');
    await expect(conectar(cookie)).rejects.toThrow('NO_AUTORIZADO:SIN_AGENCIA_ACTIVA');
  });

  it('con la agencia suspendida, se rechaza', async () => {
    const cookie = await iniciarSesion('dani');
    await admin.tenant.update({ where: { id: TENANT_C }, data: { estado: 'SUSPENDIDO' } });
    try {
      await expect(conectar(cookie)).rejects.toThrow('NO_AUTORIZADO:AGENCIA_SUSPENDIDA');
    } finally {
      await admin.tenant.update({ where: { id: TENANT_C }, data: { estado: 'ACTIVO' } });
    }
  });

  it('un Origin que no es la web se rechaza', async () => {
    const cookie = await iniciarSesion('ana');
    await expect(
      conectar(cookie, { cabeceras: { origin: 'https://sitio-malicioso.example' } }),
    ).rejects.toThrow();
  });
});

describe('las salas las asigna el servidor', () => {
  it('con la cookie de A solo se está en las salas de A, aunque el cliente pida otra cosa', async () => {
    const cookie = await iniciarSesion('ana');
    const socket = await conectar(cookie, {
      auth: { tenantId: TENANT_B, sala: salaDeTenant(TENANT_B) },
      query: { tenantId: TENANT_B },
      cabeceras: { 'x-dev-tenant-id': TENANT_B, 'x-tenant-id': TENANT_B },
    });
    await dormir(100);
    expect(await gateway.cuantosEnSala(salaDeTenant(TENANT_A))).toBe(1);
    expect(await gateway.cuantosEnSala(salaDeTenant(TENANT_B))).toBe(0);
    const usuarioAna = await admin.usuario.findFirstOrThrow({
      where: { tenantId: TENANT_A, identidadId: identidades['ana'] ?? '' },
    });
    expect(await gateway.cuantosEnSala(salaDeUsuario(usuarioAna.id))).toBe(1);
    socket.close();
  });

  it('un cliente que pide unirse a la sala de otra agencia es rechazado y no recibe nada de ella', async () => {
    const cookie = await iniciarSesion('ana');
    const socket = await conectar(cookie);
    const oyente = escuchar(socket);

    const respuesta = await socket
      .timeout(2000)
      .emitWithAck(EVENTO_SOCKET_UNIRSE, { sala: salaDeTenant(TENANT_B) });
    expect(RespuestaDeUnirse.parse(respuesta)).toEqual({ ok: false, error: 'SALA_NO_PERMITIDA' });
    expect(await gateway.cuantosEnSala(salaDeTenant(TENANT_B))).toBe(0);

    // Una sala inventada o un cuerpo malformado tampoco.
    for (const carga of [{ sala: 'tenant:*' }, { sala: 'usuario:otro' }, 'cualquier cosa', null]) {
      const r = await socket.timeout(2000).emitWithAck(EVENTO_SOCKET_UNIRSE, carga);
      expect(RespuestaDeUnirse.parse(r).ok).toBe(false);
    }

    // Y pedir la propia es inocuo: ya estaba en ella.
    const propia = await socket
      .timeout(2000)
      .emitWithAck(EVENTO_SOCKET_UNIRSE, { sala: salaDeTenant(TENANT_A) });
    expect(RespuestaDeUnirse.parse(propia)).toEqual({ ok: true, sala: salaDeTenant(TENANT_A) });

    // El evento de B, publicado después del intento, no le llega.
    await publicador.publicar(evento(TENANT_B, mensajeDe.B));
    await dormir(400);
    expect(oyente.eventos).toHaveLength(0);
    socket.close();
  });
});

describe('los eventos llegan solo a la agencia del evento', () => {
  it('con la cookie de A no se reciben eventos de B (y al revés)', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const beto = await conectar(await iniciarSesion('beto'));
    const deAna = escuchar(ana);
    const deBeto = escuchar(beto);

    await publicador.publicar(evento(TENANT_A, mensajeDe.A));
    await publicador.publicar(evento(TENANT_B, mensajeDe.B));
    await hasta(() => deAna.eventos.length >= 1 && deBeto.eventos.length >= 1);
    await dormir(300);

    expect(deAna.eventos).toHaveLength(1);
    expect(deBeto.eventos).toHaveLength(1);
    const a = EventoBandeja.parse(deAna.eventos[0]);
    const b = EventoBandeja.parse(deBeto.eventos[0]);
    expect(a.tipo === 'MENSAJE_NUEVO' && a.mensaje.id).toBe(mensajeDe.A);
    expect(b.tipo === 'MENSAJE_NUEVO' && b.mensaje.id).toBe(mensajeDe.B);
    expect(JSON.stringify(deAna.eventos)).not.toContain('agencia B');
    expect(JSON.stringify(deBeto.eventos)).not.toContain('agencia A');
    ana.close();
    beto.close();
  });

  it('la carga es el contrato EventoBandeja: sin neto, margen ni teléfono', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const oyente = escuchar(ana);
    await publicador.publicar(evento(TENANT_A, mensajeDe.A));
    await hasta(() => oyente.eventos.length >= 1);

    const e = EventoBandeja.parse(oyente.eventos[0]);
    expect(e.tipo).toBe('MENSAJE_NUEVO');
    const texto = JSON.stringify(oyente.eventos[0]);
    expect(texto).not.toMatch(/neto|margen|telefono|e164|wamid|tenant/i);
    expect(e.tipo === 'MENSAJE_NUEVO' && e.mensaje.texto).toBe('Consulta para la agencia A');
    ana.close();
  });

  it('un evento cuyo mensaje no existe en SU tenant no se emite (RLS no deja ver el de otro)', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const oyente = escuchar(ana);
    // Un evento que dice ser de A pero apunta al mensaje de B.
    await publicador.publicar(evento(TENANT_A, mensajeDe.B));
    await dormir(400);
    expect(oyente.eventos).toHaveLength(0);
    ana.close();
  });

  it('un evento con forma inválida no sale', async () => {
    await expect(
      publicador.publicar({ ...evento(TENANT_A, mensajeDe.A), tenantId: 'no-es-uuid' }),
    ).rejects.toThrow();
  });
});

describe('la revalidación repite los pasos 3 y 4', () => {
  it('con la sesión revocada, el socket se cierra en la siguiente revalidación', async () => {
    const cookie = await iniciarSesion('ana');
    const socket = await conectar(cookie);
    const oyente = escuchar(socket);
    await gateway.revalidarTodos();
    await dormir(150);
    expect(oyente.cerrado()).toBe(false);

    await adminPg.query('DELETE FROM sesiones WHERE identidad_id = $1', [identidades['ana']]);
    await gateway.revalidarTodos();
    await hasta(oyente.cerrado);

    expect(oyente.cerrado()).toBe(true);
    expect(oyente.cierres).toEqual([{ motivo: 'SIN_SESION' }]);
  });

  it('con la membresía dada de baja, igual', async () => {
    const cookie = await iniciarSesion('beto');
    const socket = await conectar(cookie);
    const oyente = escuchar(socket);

    await admin.usuario.updateMany({
      where: { tenantId: TENANT_B, identidadId: identidades['beto'] ?? '' },
      data: { activo: false },
    });
    try {
      await gateway.revalidarTodos();
      await hasta(oyente.cerrado);
      expect(oyente.cerrado()).toBe(true);
      expect(oyente.cierres).toEqual([{ motivo: 'ACCESO_REVOCADO' }]);
    } finally {
      await admin.usuario.updateMany({
        where: { tenantId: TENANT_B, identidadId: identidades['beto'] ?? '' },
        data: { activo: true },
      });
    }
  });

  it('con la agencia suspendida a mitad de la conexión, igual', async () => {
    const cookie = await iniciarSesion('dani');
    const socket = await conectar(cookie);
    const oyente = escuchar(socket);
    await admin.tenant.update({ where: { id: TENANT_C }, data: { estado: 'SUSPENDIDO' } });
    try {
      await gateway.revalidarTodos();
      await hasta(oyente.cerrado);
      expect(oyente.cierres).toEqual([{ motivo: 'AGENCIA_SUSPENDIDA' }]);
    } finally {
      await admin.tenant.update({ where: { id: TENANT_C }, data: { estado: 'ACTIVO' } });
    }
  });

  it('si la persona cambia de agencia activa, el socket se cierra: las salas ya no son suyas', async () => {
    const cookie = await iniciarSesion('cami');
    const cambiar = (tenantId: string) =>
      fetch(new URL('/api/v1/auth/tenant-activo', base), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGEN_WEB,
          cookie,
          'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
        },
        body: JSON.stringify({ tenantId }),
      });
    expect((await cambiar(TENANT_A)).status).toBe(200);
    const socket = await conectar(cookie);
    const oyente = escuchar(socket);
    await gateway.revalidarTodos();
    expect(oyente.cerrado()).toBe(false);

    expect((await cambiar(TENANT_B)).status).toBe(200);
    await gateway.revalidarTodos();
    await hasta(oyente.cerrado);
    expect(oyente.cerrado()).toBe(true);
  });

  it('un socket sano sobrevive a la revalidación', async () => {
    const socket = await conectar(await iniciarSesion('beto'));
    const oyente = escuchar(socket);
    await gateway.revalidarTodos();
    await gateway.revalidarTodos();
    await dormir(200);
    expect(oyente.cerrado()).toBe(false);
    socket.close();
  });
});

describe('el cierre por evento (no espera a los 60 s)', () => {
  it('identity.acceso_revocado cierra los sockets de ese usuario y de nadie más', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const beto = await conectar(await iniciarSesion('beto'));
    const deAna = escuchar(ana);
    const deBeto = escuchar(beto);
    const usuarioAna = await admin.usuario.findFirstOrThrow({
      where: { tenantId: TENANT_A, identidadId: identidades['ana'] ?? '' },
    });

    await publicador.publicar({
      id: '1',
      tipo: TIPO_ACCESO_REVOCADO,
      tenantId: TENANT_A,
      agregadoId: usuarioAna.id,
      payload: { usuarioId: usuarioAna.id },
    });
    await hasta(deAna.cerrado);
    await dormir(200);

    expect(deAna.cerrado()).toBe(true);
    expect(deAna.cierres).toEqual([{ motivo: 'ACCESO_REVOCADO' }]);
    expect(deBeto.cerrado()).toBe(false);
    beto.close();
  });

  it('el evento de otra agencia no cierra el socket del mismo usuarioId', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const oyente = escuchar(ana);
    const usuarioAna = await admin.usuario.findFirstOrThrow({
      where: { tenantId: TENANT_A, identidadId: identidades['ana'] ?? '' },
    });
    await publicador.publicar({
      id: '2',
      tipo: TIPO_ACCESO_REVOCADO,
      tenantId: TENANT_B,
      agregadoId: usuarioAna.id,
      payload: { usuarioId: usuarioAna.id },
    });
    await dormir(400);
    expect(oyente.cerrado()).toBe(false);
    ana.close();
  });
});
