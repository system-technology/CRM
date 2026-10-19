/**
 * El barrido de changes pendientes, de punta a punta con Redis REAL y la base real.
 *
 * El escenario que existe para cubrir: **el POST guardó la recepción y el encolado falló**. La
 * fila está en la base, Meta ya tiene su respuesta y nadie recogerá el change. Aquí el encolado
 * «falla» arrancando la API con la cola inerte (guarda y no encola, que es lo que queda tras una
 * muerte entre las dos cosas). Después corre el barrido y el mensaje tiene que llegar a
 * `mensajes`.
 *
 * Afirma:
 *   · un change pendiente sin trabajo se reencola y el consumidor lo lleva a `mensajes`;
 *   · uno que ya no está pendiente no vuelve a aparecer en el barrido;
 *   · dos barridos concurrentes dejan UN solo trabajo (el `jobId` lo impide);
 *   · un trabajo FALLIDO con ese id se borra antes de reencolar: si no, BullMQ descarta el `add`
 *     en silencio y el mensaje se pierde.
 *
 * **Aislamiento.** Usa una cola con nombre propio, porque el consumidor de `inbox-bullmq` corre
 * en la misma CI sobre la cola de siempre y se llevaría estos trabajos (o esta prueba los suyos).
 * Y el barrido solo ve las recepciones de esta corrida: la función de base lista TODO lo
 * pendiente, y otras pruebas dejan filas pendientes mientras corren.
 *
 * **Cuándo corre.** Igual que `inbox-bullmq`: con `CI=true` o con `PRUEBA_BULLMQ=1` y un
 * `REDIS_URL` desechable. En local sin Redis se salta, y lo dice.
 */
import 'reflect-metadata';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { BarrerPendientes } from './application/barrer-pendientes.js';
import { ProcesarChange } from './application/procesar-change.js';
import { type ChangePendiente, PuertoPendientes } from './application/puertos-de-barrido.js';
import { claveDeEnrutamiento } from './domain/clave-de-enrutamiento.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import { BarridoBullmq } from './infrastructure/barrido.bullmq.js';
import {
  crearConexionDeRedis,
  type DatosDelTrabajo,
  idDeTrabajo,
  OPCIONES_DE_TRABAJO,
} from './infrastructure/cola-de-changes.bullmq.js';
import { PendientesPrisma } from './infrastructure/pendientes.prisma.js';
import { StagingPrisma } from './infrastructure/staging.prisma.js';
import { ConsumidorDeChanges } from './interface/consumidor-de-changes.js';

const HAY_REDIS_REAL = process.env['CI'] === 'true' || process.env['PRUEBA_BULLMQ'] === '1';
const URL_REDIS = process.env['REDIS_URL'] ?? '';
const CORRE = HAY_REDIS_REAL && URL_REDIS !== '';

if (!CORRE) {
  console.warn(
    '[inbox-barrido.e2e] SALTADA: necesita Redis real. Corre con CI=true o con PRUEBA_BULLMQ=1 y ' +
      'REDIS_URL apuntando a un Redis desechable.',
  );
}

const SECRETO = randomBytes(24).toString('hex');
const MARCA = randomUUID();
const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';
const TENANT = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const CUENTA = randomUUID();
const CANAL = randomUUID();
const PN = String(Math.floor(Math.random() * 9e14) + 1e14);
const COLA = `inbox-changes-barrido-${randomBytes(4).toString('hex')}`;
/** Para que un barrido de 1 s alcance a ver lo recién guardado sin esperar 30. */
const ANTIGUEDAD_S = 1;

let app: INestApplication;
let base: string;
let admin: Client;
let cola: Queue<DatosDelTrabajo>;
let conexionCola: ReturnType<typeof crearConexionDeRedis>;
let prismaWebhook: PrismaWebhookService;
let consumidor: ConsumidorDeChanges;
const barridos: BarridoBullmq[] = [];
const RECEPCIONES: Buffer[] = [];
const entorno = { ...process.env };

const idDe = (c: Buffer): Buffer => createHash('sha256').update(c).digest();
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Solo las recepciones de esta corrida: la base lista todo lo pendiente de todos. */
class SoloLasMias extends PuertoPendientes {
  constructor(private readonly real: PuertoPendientes) {
    super();
  }
  async listar(antiguedad: number, limite: number): Promise<ChangePendiente[]> {
    const todas = await this.real.listar(antiguedad, limite);
    const mias = new Set(RECEPCIONES.map((r) => r.toString('hex')));
    return todas.filter((f) => mias.has(f.recepcionId.toString('hex')));
  }
}

function nuevoBarrido(): { barrer: BarrerPendientes; redis: BarridoBullmq } {
  const redis = new BarridoBullmq(URL_REDIS, COLA);
  barridos.push(redis);
  return {
    redis,
    barrer: new BarrerPendientes(
      new SoloLasMias(new PendientesPrisma(prismaWebhook)),
      redis,
      redis,
    ),
  };
}

const CONFIG = { antiguedadMinimaS: ANTIGUEDAD_S, limite: 1000, maxReencolados: 10 };

function sobre(wamid: string): Buffer {
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
                metadata: { display_phone_number: '15550783881', phone_number_id: PN },
                contacts: [{ profile: { name: 'Viajero' }, wa_id: '573009998866' }],
                messages: [
                  {
                    from: '573009998866',
                    id: wamid,
                    timestamp: '1760900000',
                    text: { body: `Hola desde el barrido ${MARCA}` },
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
  const firma = 'sha256=' + createHmac('sha256', SECRETO).update(cuerpo).digest('hex');
  const r = await fetch(new URL('/webhooks/whatsapp', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
    body: cuerpo,
  });
  return r.status;
}

async function esperar<T>(que: () => Promise<T | undefined>, ms = 30_000): Promise<T> {
  const limite = Date.now() + ms;
  for (;;) {
    const v = await que();
    if (v !== undefined) return v;
    if (Date.now() > limite) throw new Error('Se agotó la espera de la condición.');
    await dormir(200);
  }
}

async function mensajesDe(wamid: string): Promise<Array<{ tenant_id: string }>> {
  const r = await admin.query('SELECT tenant_id FROM mensajes WHERE wamid = $1', [wamid]);
  return r.rows as Array<{ tenant_id: string }>;
}

async function trabajosConId(id: string): Promise<number> {
  const todos = await cola.getJobs(
    ['waiting', 'active', 'delayed', 'completed', 'failed', 'prioritized'],
    0,
    -1,
  );
  return todos.filter((j) => j.id === id).length;
}

describe.skipIf(!CORRE)('Barrido: un POST guardado cuyo encolado falló llega a mensajes', () => {
  beforeAll(async () => {
    if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
    process.env['META_APP_SECRET'] = SECRETO;
    process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
    process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';
    // El POST guarda y NO encola: es lo que queda cuando el encolado falla o el proceso muere.
    process.env['COLA_CHANGES'] = 'inerte';

    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);

    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [
        TENANT,
        `fixture-aislamiento-barrido-${TENANT.slice(-12)}`,
        'Agencia de la prueba del barrido',
      ],
    );
    await admin.query(
      `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en) VALUES ($1, $2, $3, 'WABA barrido', now())`,
      [CUENTA, TENANT, `waba-barrido-${CUENTA.slice(0, 8)}`],
    );
    await admin.query(
      `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en) VALUES ($1, $2, $3, $4, '+573001110010', now())`,
      [CANAL, TENANT, CUENTA, PN],
    );
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_altas"');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [TENANT]);
      await admin.query(
        `SELECT registrar_enrutamiento($1, $2::smallint, $3, $4, $5,
                                       'ACTIVO'::estado_enrutamiento, NULL, $6)`,
        [claveDeEnrutamiento(PIMIENTA, 'pn', PN), 1, TENANT, CANAL, CUENTA, 'alta e2e barrido'],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }

    conexionCola = crearConexionDeRedis(URL_REDIS);
    cola = new Queue<DatosDelTrabajo>(COLA, { connection: conexionCola });

    Logger.overrideLogger(false);
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new DominioExcepcionFilter());
    app.use('/webhooks', (await import('express')).raw({ type: '*/*', limit: '1mb' }));
    await app.listen(0);
    base = await app.getUrl();

    prismaWebhook = new PrismaWebhookService();
    await prismaWebhook.onModuleInit();
    consumidor = new ConsumidorDeChanges(
      new ProcesarChange(new StagingPrisma(prismaWebhook), new BandejaPrisma(prismaWebhook)),
    );
    consumidor.nombreDeCola = COLA;
  });

  afterAll(async () => {
    await consumidor?.onModuleDestroy();
    // Una cola con nombre propio: se vacía entera, no hay nada ajeno que respetar.
    await cola?.obliterate({ force: true });
    await cola?.close();
    await conexionCola?.quit();
    for (const b of barridos) await b.onModuleDestroy();
    await prismaWebhook?.onModuleDestroy();
    await app?.close();
    for (const k of ['META_APP_SECRET', 'WEBHOOK_PAYLOAD_KEY', 'WEBHOOK_PAYLOAD_KEY_VERSION']) {
      if (entorno[k] === undefined) delete process.env[k];
      else process.env[k] = entorno[k];
    }
    process.env['COLA_CHANGES'] = entorno['COLA_CHANGES'] ?? 'inerte';
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
        await admin.query('DELETE FROM enrutamiento_canales WHERE tenant_resuelto_id = $1', [
          TENANT,
        ]);
        await admin.query('RESET ROLE');
        type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
        const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
        const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
        await admin.query('BEGIN');
        await modulo.borrarTenants(admin, [TENANT]);
        await admin.query('COMMIT');
      } finally {
        await admin.end();
      }
    }
  });

  it('el encolado falló: el barrido lo reencola y el mensaje llega a mensajes', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid);
    const hex = idDe(cuerpo).toString('hex');

    expect(await post(cuerpo)).toBe(200);
    // Guardado, sin trabajo: el hueco que el barrido cierra.
    expect(await trabajosConId(`${hex}-0`)).toBe(0);
    expect(await mensajesDe(wamid)).toHaveLength(0);

    await dormir((ANTIGUEDAD_S + 1) * 1_000);
    const { barrer } = nuevoBarrido();
    const r = await barrer.ejecutar(CONFIG);
    expect(r.reencolados).toBe(1);
    expect(await trabajosConId(`${hex}-0`)).toBe(1);

    consumidor.onModuleInit();
    const filas = await esperar(async () => {
      const f = await mensajesDe(wamid);
      return f.length > 0 ? f : undefined;
    });
    expect(filas).toEqual([{ tenant_id: TENANT }]);

    // Resuelto: el barrido ya no lo ve.
    await esperar(async () => {
      const x = await barrer.ejecutar(CONFIG);
      return x.candidatos === 0 ? true : undefined;
    });
    expect(await mensajesDe(wamid)).toHaveLength(1);
  });

  it('dos barridos concurrentes dejan UN solo trabajo', async () => {
    // Sin consumidor: que el trabajo se quede a la vista.
    await consumidor.onModuleDestroy();

    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid);
    const hex = idDe(cuerpo).toString('hex');
    expect(await post(cuerpo)).toBe(200);
    await dormir((ANTIGUEDAD_S + 1) * 1_000);

    const a = nuevoBarrido();
    const b = nuevoBarrido();
    await Promise.all([a.barrer.ejecutar(CONFIG), b.barrer.ejecutar(CONFIG)]);
    expect(await trabajosConId(`${hex}-0`)).toBe(1);

    // Y el turno es de uno solo por intervalo.
    const turnos = await Promise.all([a.redis.adquirirTurno(5_000), b.redis.adquirirTurno(5_000)]);
    expect(turnos.filter(Boolean)).toHaveLength(1);
  });

  it('un trabajo FALLIDO con ese id se borra antes de reencolar, y el mensaje llega', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid);
    const idRecepcion = idDe(cuerpo);
    const hex = idRecepcion.toString('hex');
    expect(await post(cuerpo)).toBe(200);

    // Deja un trabajo fallido con el id exacto: un solo intento, que lanza.
    const trabajoId = idDeTrabajo(idRecepcion, 0);
    const trampa = new Worker<DatosDelTrabajo>(
      COLA,
      () => Promise.reject(new Error('falla a propósito')),
      { connection: crearConexionDeRedis(URL_REDIS) },
    );
    await cola.add(
      'procesar-change',
      { recepcionId: hex, indice: 0 },
      { ...OPCIONES_DE_TRABAJO, attempts: 1, jobId: trabajoId },
    );
    await esperar(async () => {
      const t = await cola.getJob(trabajoId);
      return (await t?.getState()) === 'failed' ? true : undefined;
    });
    await trampa.close();
    expect(await mensajesDe(wamid)).toHaveLength(0);

    await dormir((ANTIGUEDAD_S + 1) * 1_000);
    const { barrer } = nuevoBarrido();
    const r = await barrer.ejecutar(CONFIG);
    expect(r.reencolados).toBeGreaterThanOrEqual(1);
    // Sin el borrado previo, el `add` habría sido un no-op y el trabajo seguiría `failed`.
    expect(await (await cola.getJob(trabajoId))?.getState()).not.toBe('failed');

    consumidor.onModuleInit();
    const filas = await esperar(async () => {
      const f = await mensajesDe(wamid);
      return f.length > 0 ? f : undefined;
    });
    expect(filas).toEqual([{ tenant_id: TENANT }]);
  });
});
