/**
 * BullMQ REAL, de punta a punta: POST firmado -> trabajo en Redis -> consumidor -> `mensajes`.
 *
 * Todas las demás pruebas fijan `COLA_CHANGES=inerte` y cubren el encolado y el consumo con
 * dobles. Esta es la única que cruza Redis de verdad. Afirma:
 *   · el POST deja UN trabajo con `jobId = <recepcion hex>-<indice>`, sin contenido (solo
 *     `recepcionId` e `indice`: Redis no tiene RLS ni cifrado);
 *   · el mismo POST reintentado (R5) no duplica ni el trabajo ni la fila de recepción;
 *   · al arrancar el consumidor, el mensaje llega a `mensajes` con su tenant, y un nuevo
 *     reintento ya procesado tampoco duplica el mensaje;
 *   · un error de procesamiento deja en `failedReason` solo `Clase:código`, sin PII (R10).
 *
 * **Cuándo corre.** Solo con `CI=true` (lo pone GitHub Actions, cuyo job levanta Redis 7) o con
 * `PRUEBA_BULLMQ=1` y un `REDIS_URL` que el desarrollador sepa desechable. En local sin Redis se
 * salta, y lo dice por la consola: un `skip` mudo parecería una prueba verde.
 */
import 'reflect-metadata';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, type Job } from 'bullmq';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { ProcesarChange } from './application/procesar-change.js';
import { claveDeEnrutamiento } from './domain/clave-de-enrutamiento.js';
// La prueba ensambla el proceso real: el puerto de contactos lo implementa `crm`.
import { ContactosDeCrm } from '../crm/infrastructure/puertos-de-crm.prisma.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import {
  crearConexionDeRedis,
  type DatosDelTrabajo,
  NOMBRE_DE_COLA,
} from './infrastructure/cola-de-changes.bullmq.js';
import { StagingPrisma } from './infrastructure/staging.prisma.js';
import { ConsumidorDeChanges } from './interface/consumidor-de-changes.js';

const HAY_REDIS_REAL = process.env['CI'] === 'true' || process.env['PRUEBA_BULLMQ'] === '1';
const URL_REDIS = process.env['REDIS_URL'] ?? '';
const CORRE = HAY_REDIS_REAL && URL_REDIS !== '';

if (!CORRE) {
  console.warn(
    '[inbox-bullmq.e2e] SALTADA: necesita Redis real. Corre con CI=true (el job de CI levanta ' +
      'Redis 7) o con PRUEBA_BULLMQ=1 y REDIS_URL apuntando a un Redis desechable. Las demás ' +
      'pruebas usan COLA_CHANGES=inerte.',
  );
}

const SECRETO = randomBytes(24).toString('hex');
const MARCA = randomUUID();
const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';
const TENANT = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const CUENTA = randomUUID();
const CANAL = randomUUID();
const PN = String(Math.floor(Math.random() * 9e14) + 1e14);
const TELEFONO_PII = '573009998877';

let app: INestApplication;
let base: string;
let admin: Client;
let cola: Queue<DatosDelTrabajo>;
let conexionCola: ReturnType<typeof crearConexionDeRedis>;
let prismaWebhook: PrismaWebhookService;
let consumidor: ConsumidorDeChanges;
/** Recepciones cuyo procesamiento debe fallar con un error cargado de PII. */
const FALLAR = new Set<string>();
const RECEPCIONES: Buffer[] = [];
const entorno = { ...process.env };

const idDe = (c: Buffer): Buffer => createHash('sha256').update(c).digest();
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
                contacts: [{ profile: { name: 'Viajero Ñandú' }, wa_id: TELEFONO_PII }],
                messages: [
                  {
                    from: TELEFONO_PII,
                    id: wamid,
                    timestamp: '1760900000',
                    text: { body: `Hola desde BullMQ ${MARCA}` },
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

async function trabajosConId(id: string): Promise<Job<DatosDelTrabajo>[]> {
  const todos = await cola.getJobs(
    ['waiting', 'active', 'delayed', 'completed', 'failed', 'prioritized'],
    0,
    -1,
  );
  return todos.filter((j) => j.id === id);
}

async function recepciones(cuerpo: Buffer): Promise<number> {
  const r = await admin.query(
    'SELECT count(*)::int AS n FROM recepciones_webhook WHERE recepcion_id = $1',
    [idDe(cuerpo)],
  );
  return r.rows[0].n as number;
}

describe.skipIf(!CORRE)('BullMQ real: POST -> Redis -> consumidor -> mensajes', () => {
  beforeAll(async () => {
    if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
    process.env['META_APP_SECRET'] = SECRETO;
    process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
    process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';
    // La cola REAL: el módulo solo cae a la inerte si esta variable lo dice.
    process.env['COLA_CHANGES'] = 'bullmq';

    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);

    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [TENANT, `fixture-aislamiento-bullmq-${TENANT.slice(-12)}`, 'Agencia de la prueba de BullMQ'],
    );
    await admin.query(
      `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en) VALUES ($1, $2, $3, 'WABA bullmq', now())`,
      [CUENTA, TENANT, `waba-bullmq-${CUENTA.slice(0, 8)}`],
    );
    await admin.query(
      `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en) VALUES ($1, $2, $3, $4, '+573001110009', now())`,
      [CANAL, TENANT, CUENTA, PN],
    );
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_altas"');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [TENANT]);
      await admin.query(
        `SELECT registrar_enrutamiento($1, $2::smallint, $3, $4, $5,
                                       'ACTIVO'::estado_enrutamiento, NULL, $6)`,
        [claveDeEnrutamiento(PIMIENTA, 'pn', PN), 1, TENANT, CANAL, CUENTA, 'alta e2e bullmq'],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }

    conexionCola = crearConexionDeRedis(URL_REDIS);
    cola = new Queue<DatosDelTrabajo>(NOMBRE_DE_COLA, { connection: conexionCola });

    Logger.overrideLogger(false);
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new DominioExcepcionFilter());
    app.use('/webhooks', (await import('express')).raw({ type: '*/*', limit: '1mb' }));
    await app.listen(0);
    base = await app.getUrl();

    // El consumidor real, con el caso de uso real salvo para las recepciones marcadas en FALLAR.
    prismaWebhook = new PrismaWebhookService();
    await prismaWebhook.onModuleInit();
    const real = new ProcesarChange(
      new StagingPrisma(prismaWebhook),
      new BandejaPrisma(prismaWebhook, new ContactosDeCrm()),
    );
    const conFallo = {
      ejecutar: (recepcionId: Buffer, indice: number) => {
        if (FALLAR.has(recepcionId.toString('hex'))) {
          // Como un error de base: el mensaje trae la fila y el teléfono, y trae un `code`.
          throw Object.assign(
            new Error(`Failing row contains (${TELEFONO_PII}, Hola desde BullMQ ${MARCA})`),
            { code: '23502' },
          );
        }
        return real.ejecutar(recepcionId, indice);
      },
    } as unknown as ProcesarChange;
    consumidor = new ConsumidorDeChanges(conFallo);
  });

  afterAll(async () => {
    await consumidor?.onModuleDestroy();
    // Solo los trabajos de esta corrida: la cola puede ser compartida.
    for (const id of RECEPCIONES) {
      for (const t of await trabajosConId(`${id.toString('hex')}-0`)) {
        try {
          await t.remove();
        } catch {
          // Un trabajo en curso no se puede quitar; expira por su política de limpieza.
        }
      }
    }
    await cola?.close();
    await conexionCola?.quit();
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

  it('encola con jobId <recepcion>-<indice>, sin contenido; el reintento no duplica', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid);
    const hex = idDe(cuerpo).toString('hex');

    expect(await post(cuerpo)).toBe(200);
    // El consumidor aún no arrancó: el trabajo está a la vista, esperando.
    const trabajos = await trabajosConId(`${hex}-0`);
    expect(trabajos).toHaveLength(1);
    expect(trabajos[0]?.data).toEqual({ recepcionId: hex, indice: 0 });
    expect(JSON.stringify(trabajos[0]?.data)).not.toContain(MARCA);
    expect(await trabajos[0]?.getState()).toBe('waiting');

    // El reintento de Meta: mismo cuerpo, misma firma.
    expect(await post(cuerpo)).toBe(200);
    expect(await trabajosConId(`${hex}-0`)).toHaveLength(1);
    expect(await recepciones(cuerpo)).toBe(1);
    expect(await mensajesDe(wamid)).toHaveLength(0);

    // Arranca el consumidor: el mensaje llega a `mensajes` con su tenant.
    consumidor.onModuleInit();
    const filas = await esperar(async () => {
      const f = await mensajesDe(wamid);
      return f.length > 0 ? f : undefined;
    });
    expect(filas).toEqual([{ tenant_id: TENANT }]);

    // Un reintento posterior, ya procesado: ni segundo trabajo ni segunda fila.
    expect(await post(cuerpo)).toBe(200);
    await dormir(1_500);
    expect(await trabajosConId(`${hex}-0`)).toHaveLength(1);
    expect(await recepciones(cuerpo)).toBe(1);
    expect(await mensajesDe(wamid)).toHaveLength(1);
  });

  it('un error de procesamiento deja en failedReason solo Clase:código, sin PII', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid);
    const hex = idDe(cuerpo).toString('hex');
    FALLAR.add(hex);

    expect(await post(cuerpo)).toBe(200);
    const motivo = await esperar(async () => {
      const [t] = await trabajosConId(`${hex}-0`);
      return t?.failedReason ? t.failedReason : undefined;
    });

    expect(motivo).toContain('Error:23502');
    expect(motivo).not.toContain(TELEFONO_PII);
    expect(motivo).not.toContain(MARCA);
    expect(motivo).not.toContain('Failing row');
    expect(await mensajesDe(wamid)).toHaveLength(0);
  });
});
