/**
 * De un POST firmado de Meta al socket del asesor, por los DOS procesos y Redis de verdad.
 *
 *   POST firmado -> API (staging) -> trabajador (ProcesarChange: mensaje + outbox, misma
 *   transacción) -> relay del outbox -> Redis pub/sub -> API (esta réplica) -> Socket.IO -> asesor
 *
 * Afirma:
 *   · el cliente de la agencia correcta recibe el evento y el de la OTRA no;
 *   · el texto del viajero y su teléfono NO pasan por Redis (se escucha el canal en crudo): el
 *     evento lleva identificadores y la API lee el contenido de la base, bajo RLS;
 *   · el relay es idempotente: el barrido no repite lo ya publicado;
 *   · `identity.acceso_revocado`, publicado por Redis, cierra el socket sin esperar a los 60 s;
 *   · un mensaje de Redis que no cumple el contrato se descarta sin tumbar nada.
 *
 * **Cuándo corre.** Solo con `CI=true` (el job levanta Redis 7) o con `PRUEBA_BULLMQ=1` y un
 * `REDIS_URL` desechable; en local sin Redis se salta y lo dice.
 */
import 'reflect-metadata';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  EVENTO_SOCKET_BANDEJA,
  EVENTO_SOCKET_CIERRE,
  EventoBandeja,
  RUTA_SOCKET_BANDEJA,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Redis } from 'ioredis';
import { Client } from 'pg';
import { io as clienteIo, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { ContactosDeCrm } from '../crm/infrastructure/puertos-de-crm.prisma.js';
import { ProcesarChange } from './application/procesar-change.js';
import { RelevarOutbox } from './application/relevar-outbox.js';
import { claveDeEnrutamiento } from './domain/clave-de-enrutamiento.js';
import { CANAL_DE_EVENTOS, TIPO_ACCESO_REVOCADO } from './domain/evento-de-dominio.js';
import { AvisosDeOutboxEnMemoria } from './infrastructure/avisos-de-outbox.en-memoria.js';
import { cifradoDePrueba } from '../../shared/cifrado/cifrado-de-prueba.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import { PublicadorRedis } from './infrastructure/bus-de-eventos.redis.js';
import { OutboxPrisma } from './infrastructure/outbox.prisma.js';
import { StagingPrisma } from './infrastructure/staging.prisma.js';
import { PlanificadorDeRelay } from './interface/planificador-de-relay.js';

const HAY_REDIS_REAL = process.env['CI'] === 'true' || process.env['PRUEBA_BULLMQ'] === '1';
const URL_REDIS = process.env['REDIS_URL'] ?? '';
const CORRE = HAY_REDIS_REAL && URL_REDIS !== '';

if (!CORRE) {
  console.warn(
    '[inbox-tiempo-real-redis.e2e] SALTADA: necesita Redis real. Corre con CI=true o con ' +
      'PRUEBA_BULLMQ=1 y REDIS_URL apuntando a un Redis desechable.',
  );
}

const SECRETO = randomBytes(24).toString('hex');
const MARCA = randomUUID();
const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';
const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const numero = (): string => String(Math.floor(Math.random() * 9e14) + 1e14);
const PN = { A: numero(), B: numero() };
const CUENTA = { A: randomUUID(), B: randomUUID() };
const CANAL = { A: randomUUID(), B: randomUUID() };
const TELEFONO_DEL_VIAJERO = '573007776655';
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const correo = (quien: string): string =>
  `fixture-aislamiento-redis-${randomBytes(3).toString('hex')}-${quien}@fixture-identidad.test`;
const C = { ana: correo('ana'), beto: correo('beto') };
const identidades: string[] = [];

let app: INestApplication;
let base: string;
let admin: Client;
let adminPrisma: PrismaClient;
let prismaWebhook: PrismaWebhookService;
let caso: ProcesarChange;
let planificador: PlanificadorDeRelay;
let publicador: PublicadorRedis;
let espia: Redis;
const crudoEnRedis: string[] = [];
const RECEPCIONES: Buffer[] = [];
const abiertos: Socket[] = [];
const entorno = { ...process.env };

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const rnd = (): number => Math.floor(Math.random() * 250) + 1;
const idDe = (c: Buffer): Buffer => createHash('sha256').update(c).digest();
const firmar = (c: Buffer): string =>
  'sha256=' + createHmac('sha256', SECRETO).update(c).digest('hex');

function sobre(phoneNumberId: string, wamid: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '102290129340398',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15550783881', phone_number_id: phoneNumberId },
                contacts: [{ profile: { name: 'Viajera Ñandú' }, wa_id: TELEFONO_DEL_VIAJERO }],
                messages: [
                  {
                    from: TELEFONO_DEL_VIAJERO,
                    id: wamid,
                    timestamp: '1760900000',
                    text: { body: `¿Cuánto cuesta San Andrés? ${MARCA}` },
                    type: 'text',
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
    'utf8',
  );
}

async function post(cuerpo: Buffer): Promise<number> {
  RECEPCIONES.push(idDe(cuerpo));
  const r = await fetch(new URL('/webhooks/whatsapp', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firmar(cuerpo) },
    body: cuerpo,
  });
  return r.status;
}

async function registrarEnDirectorio(pn: string, canal: string, tenant: string, cuenta: string) {
  await admin.query('BEGIN');
  try {
    await admin.query('SET LOCAL ROLE "viajapro_altas"');
    await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
    await admin.query(
      `SELECT registrar_enrutamiento($1, $2::smallint, $3, $4, $5,
                                     'ACTIVO'::estado_enrutamiento, NULL, $6)`,
      [claveDeEnrutamiento(PIMIENTA, 'pn', pn), 1, tenant, canal, cuenta, 'alta de prueba e2e'],
    );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

async function agencia(tenant: string, clave: 'A' | 'B', quien: keyof typeof C): Promise<void> {
  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
    [tenant, `fixture-aislamiento-redis-${tenant.slice(-12)}`, `Agencia ${clave} (Redis)`],
  );
  await admin.query(
    `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
     VALUES ($1, $2, $3, 'WABA', now())`,
    [CUENTA[clave], tenant, `waba-redis-${CUENTA[clave].slice(0, 8)}`],
  );
  await admin.query(
    `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [CANAL[clave], tenant, CUENTA[clave], PN[clave], `+5730011100${clave === 'A' ? '1' : '2'}`],
  );
  await registrarEnDirectorio(PN[clave], CANAL[clave], tenant, CUENTA[clave]);

  const rol = await adminPrisma.rol.create({
    data: { tenantId: tenant, nombre: 'Asesor', clave: 'ASESOR', permisos: [] },
  });
  const identidad = await adminPrisma.identidad.create({
    data: { correo: C[quien], nombre: quien, correoVerificado: true },
  });
  identidades.push(identidad.id);
  await adminPrisma.credencial.create({
    data: {
      identidadId: identidad.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  await adminPrisma.usuario.create({
    data: {
      tenantId: tenant,
      identidadId: identidad.id,
      rolId: rol.id,
      correo: C[quien],
      nombre: quien,
    },
  });
}

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

function escuchar(socket: Socket) {
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

async function hasta(condicion: () => boolean, ms = 8000): Promise<void> {
  for (let t = 0; t < ms && !condicion(); t += 50) await dormir(50);
}

/** El camino del trabajador: tomar el change, escribir mensaje + evento, y relevar el outbox. */
async function procesarYRelevar(cuerpo: Buffer): Promise<void> {
  const r = await caso.ejecutar(idDe(cuerpo), 0, entorno);
  expect(r).toEqual({ estado: 'PROCESADO', mensajesNuevos: 1, mensajesRepetidos: 0 });
  await planificador.tickDeAvisos();
}

/** El relay de prueba solo recorre las agencias de fixture: la base es compartida. */
class OutboxAcotado extends OutboxPrisma {
  override tenantsParaBarrer(): Promise<string[]> {
    return Promise.resolve([TENANT_A, TENANT_B]);
  }
}

describe.skipIf(!CORRE)('POST firmado -> trabajador -> Redis -> socket', () => {
  beforeAll(async () => {
    if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
    process.env['META_APP_SECRET'] = SECRETO;
    process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
    process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';
    // El bus por Redis: la prueba NO usa el bus en memoria que fijan las demás.
    delete process.env['BUS_DE_EVENTOS'];
    Object.assign(entorno, {
      META_APP_SECRET: SECRETO,
      WEBHOOK_PAYLOAD_KEY: process.env['WEBHOOK_PAYLOAD_KEY'],
      WEBHOOK_PAYLOAD_KEY_VERSION: '1',
    });

    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);
    adminPrisma = new PrismaClient({
      datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } },
    });

    await agencia(TENANT_A, 'A', 'ana');
    await agencia(TENANT_B, 'B', 'beto');

    // Escucha el canal EN CRUDO: lo que Redis ve de verdad.
    espia = new Redis(URL_REDIS, { maxRetriesPerRequest: null });
    espia.on('message', (_c: string, texto: string) => crudoEnRedis.push(texto));
    await espia.subscribe(CANAL_DE_EVENTOS);

    Logger.overrideLogger(false);
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new DominioExcepcionFilter());
    (app as NestExpressApplication).set('trust proxy', 1);
    app.use('/webhooks', (await import('express')).raw({ type: '*/*', limit: '1mb' }));
    await app.listen(0);
    base = await app.getUrl();

    // El trabajador, tal como lo ensambla `InboxWorkerModule`, con su propio rol.
    prismaWebhook = new PrismaWebhookService();
    await prismaWebhook.onModuleInit();
    const avisos = new AvisosDeOutboxEnMemoria();
    caso = new ProcesarChange(
      new StagingPrisma(prismaWebhook),
      new BandejaPrisma(prismaWebhook, new ContactosDeCrm(), cifradoDePrueba()),
      avisos,
    );
    publicador = new PublicadorRedis(URL_REDIS);
    planificador = new PlanificadorDeRelay(
      new RelevarOutbox(new OutboxAcotado(prismaWebhook), publicador),
      avisos,
    );
    // Los tres sockets de la prueba nacen aquí: no hay trabajo de fondo que los interrumpa.
  });

  afterAll(async () => {
    for (const s of abiertos) s.close();
    await publicador?.onModuleDestroy();
    await espia?.quit();
    await prismaWebhook?.onModuleDestroy();
    await app?.close();
    if (admin) {
      try {
        await admin.query('SET ROLE "viajapro_staging"');
        await admin.query('DELETE FROM recepciones_webhook_changes WHERE recepcion_id = ANY($1)', [
          RECEPCIONES,
        ]);
        await admin.query('DELETE FROM recepciones_webhook WHERE recepcion_id = ANY($1)', [
          RECEPCIONES,
        ]);
        await admin.query('RESET ROLE');
        await admin.query('SET ROLE "viajapro_enrutador"');
        await admin.query('DELETE FROM enrutamiento_canales WHERE tenant_resuelto_id = ANY($1)', [
          [TENANT_A, TENANT_B],
        ]);
        await admin.query('RESET ROLE');
        type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
        const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
        const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
        await admin.query('BEGIN');
        await modulo.borrarTenants(admin, [TENANT_A, TENANT_B]);
        await admin.query('COMMIT');
        await admin.query('DELETE FROM identidades WHERE id = ANY($1::uuid[])', [identidades]);
      } finally {
        await admin.end();
      }
    }
    await adminPrisma?.$disconnect();
    process.env['BUS_DE_EVENTOS'] = 'memoria';
  });

  it('el evento llega al cliente de la agencia correcta y NO al de la otra', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const beto = await conectar(await iniciarSesion('beto'));
    const deAna = escuchar(ana);
    const deBeto = escuchar(beto);

    // Un mensaje para la agencia A.
    const cuerpoA = sobre(PN.A, `wamid.${randomUUID()}`);
    expect(await post(cuerpoA)).toBe(200);
    await procesarYRelevar(cuerpoA);
    await hasta(() => deAna.eventos.length >= 1);
    await dormir(500);

    expect(deAna.eventos).toHaveLength(1);
    expect(deBeto.eventos).toHaveLength(0);
    const e = EventoBandeja.parse(deAna.eventos[0]);
    expect(e.tipo === 'MENSAJE_NUEVO' && e.mensaje.texto).toContain(MARCA);

    // Y uno para la agencia B: ahora al revés.
    const cuerpoB = sobre(PN.B, `wamid.${randomUUID()}`);
    expect(await post(cuerpoB)).toBe(200);
    await procesarYRelevar(cuerpoB);
    await hasta(() => deBeto.eventos.length >= 1);
    await dormir(500);

    expect(deBeto.eventos).toHaveLength(1);
    expect(deAna.eventos).toHaveLength(1);
  });

  it('el texto del viajero y su teléfono NO pasan por Redis', () => {
    expect(crudoEnRedis.length).toBeGreaterThanOrEqual(2);
    const todo = crudoEnRedis.join('\n');
    expect(todo).not.toContain(MARCA);
    expect(todo).not.toContain('San Andrés');
    expect(todo).not.toContain(TELEFONO_DEL_VIAJERO);
    for (const crudo of crudoEnRedis) {
      expect(Object.keys(JSON.parse(crudo) as object).sort()).toEqual([
        'agregadoId',
        'id',
        'payload',
        'tenantId',
        'tipo',
      ]);
    }
  });

  it('el relay es idempotente: el barrido no repite lo ya publicado', async () => {
    const antes = crudoEnRedis.length;
    await planificador.tickDeBarrido();
    await planificador.tickDeBarrido();
    await dormir(400);
    expect(crudoEnRedis.length).toBe(antes);
    const { rows } = await admin.query(
      'SELECT count(*)::int AS n FROM outbox WHERE tenant_id = ANY($1) AND publicado_en IS NULL',
      [[TENANT_A, TENANT_B]],
    );
    expect(rows[0].n).toBe(0);
  });

  it('un mensaje de Redis que no cumple el contrato se descarta, y la API sigue sirviendo', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const oyente = escuchar(ana);
    const emisor = new Redis(URL_REDIS, { maxRetriesPerRequest: null });
    await emisor.publish(CANAL_DE_EVENTOS, 'esto no es json');
    await emisor.publish(CANAL_DE_EVENTOS, JSON.stringify({ tipo: 'x', tenantId: 'no-uuid' }));
    await emisor.quit();
    await dormir(400);
    expect(oyente.eventos).toHaveLength(0);
    expect(oyente.cerrado()).toBe(false);

    const cuerpo = sobre(PN.A, `wamid.${randomUUID()}`);
    await post(cuerpo);
    await procesarYRelevar(cuerpo);
    await hasta(() => oyente.eventos.length >= 1);
    expect(oyente.eventos).toHaveLength(1);
  });

  it('identity.acceso_revocado, por Redis, cierra el socket sin esperar a los 60 s', async () => {
    const ana = await conectar(await iniciarSesion('ana'));
    const beto = await conectar(await iniciarSesion('beto'));
    const deAna = escuchar(ana);
    const deBeto = escuchar(beto);
    const usuario = await adminPrisma.usuario.findFirstOrThrow({
      where: { tenantId: TENANT_A, correo: C.ana },
    });

    await publicador.publicar({
      id: '99',
      tipo: TIPO_ACCESO_REVOCADO,
      tenantId: TENANT_A,
      agregadoId: usuario.id,
      payload: { usuarioId: usuario.id },
    });
    await hasta(deAna.cerrado);

    expect(deAna.cerrado()).toBe(true);
    expect(deAna.cierres).toEqual([{ motivo: 'ACCESO_REVOCADO' }]);
    expect(deBeto.cerrado()).toBe(false);
  });
});
