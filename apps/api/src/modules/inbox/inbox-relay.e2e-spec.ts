/**
 * De un POST firmado a la fila en `mensajes`, con su tenant. Contra Neon, sin dobles de base.
 *
 * El recorrido es el del ADR-0008: la API recibe y guarda el sobre cifrado (rol `viajapro_app`);
 * el trabajador toma el change, resuelve el tenant con las funciones de `viajapro_webhook`,
 * escribe bajo RLS y cierra anulando el contenido.
 *
 * **Lo que sustituye al entorno.** No hay Redis local, así que la cola es inerte y esta prueba
 * hace de BullMQ: llama a `ProcesarChange.ejecutar(recepcionId, indice)` con los mismos datos que
 * llevaría el trabajo. El encolado se cubre con un doble en `registrar-recepcion.spec.ts`.
 *
 * **El caso del canal revocado (tarea 4f).** El directorio se siembra `ACTIVO` y DESPUÉS el canal
 * se marca `REVOCADO` en `canales`, que es justo el desacuerdo que la tarea 4f describe. La
 * prueba afirma el resultado —nada de negocio, contenido anulado—, así que pasa tanto con el
 * directorio desactualizado (el trabajador contrasta con la verdad) como cuando la migración de
 * `datos` lo reconcilie (el directorio ya dirá `REVOCADO`).
 *
 * Los secretos son de ESTA prueba, salvo la pimienta del directorio, que se lee del entorno
 * porque el directorio real se calcula con ella. Nada de esto se escribe en un archivo.
 */
import 'reflect-metadata';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
import { StagingPrisma } from './infrastructure/staging.prisma.js';

const SECRETO = randomBytes(24).toString('hex');
const MARCA = randomUUID();
const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';

const TENANT = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const CUENTA = randomUUID();
const CANAL_ACTIVO = randomUUID();
const CANAL_REVOCADO = randomUUID();
const numero = (): string => String(Math.floor(Math.random() * 9e14) + 1e14);
const PN_ACTIVO = numero();
const PN_REVOCADO = numero();
const PN_DESCONOCIDO = numero();
// Una SEGUNDA agencia, para los casos que cruzan tenants.
const TENANT_B = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const CUENTA_B = randomUUID();
const CANAL_B = randomUUID();
const PN_B = numero();

let app: INestApplication;
let base: string;
let admin: Client;
let prismaWebhook: PrismaWebhookService;
let caso: ProcesarChange;

function firmar(cuerpo: Buffer): string {
  return 'sha256=' + createHmac('sha256', SECRETO).update(cuerpo).digest('hex');
}
const idDe = (cuerpo: Buffer): Buffer => createHash('sha256').update(cuerpo).digest();

function sobre(phoneNumberId: string, wamid: string, telefono = '573001112233'): Buffer {
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
                contacts: [{ profile: { name: 'Viajero Ñandú' }, wa_id: telefono }],
                messages: [
                  {
                    from: telefono,
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

/** Las recepciones que creó ESTA corrida: el desmontaje borra solo estas, nunca la tabla. */
const RECEPCIONES_DE_LA_CORRIDA: Buffer[] = [];

async function post(cuerpo: Buffer): Promise<number> {
  RECEPCIONES_DE_LA_CORRIDA.push(idDe(cuerpo));
  const r = await fetch(new URL('/webhooks/whatsapp', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firmar(cuerpo) },
    body: cuerpo,
  });
  return r.status;
}

async function mensajesDe(wamid: string): Promise<number> {
  const r = await admin.query('SELECT count(*)::int AS n FROM mensajes WHERE wamid = $1', [wamid]);
  return r.rows[0].n as number;
}

async function payloadAnulado(cuerpo: Buffer): Promise<boolean> {
  const r = await admin.query(
    'SELECT payload_cifrado IS NULL AS anulado FROM recepciones_webhook WHERE recepcion_id = $1',
    [idDe(cuerpo)],
  );
  return r.rows[0]?.anulado === true;
}

async function registrarEnDirectorio(
  pn: string,
  canal: string,
  tenant = TENANT,
  cuenta = CUENTA,
): Promise<void> {
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

beforeAll(async () => {
  if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
  process.env['META_APP_SECRET'] = SECRETO;
  process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
  process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';

  admin = new Client({ connectionString: process.env['DATABASE_URL'] });
  await admin.connect();
  const bd = await admin.query('SELECT current_database() AS db');
  if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);

  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, now(), now())`,
    [TENANT, `fixture-aislamiento-relay-${TENANT.slice(-12)}`, 'Agencia de la prueba del relay'],
  );
  await admin.query(
    `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
     VALUES ($1, $2, $3, 'WABA de prueba', now())`,
    [CUENTA, TENANT, `waba-relay-${CUENTA.slice(0, 8)}`],
  );
  for (const [canal, pn, tel] of [
    [CANAL_ACTIVO, PN_ACTIVO, '+573001110001'],
    [CANAL_REVOCADO, PN_REVOCADO, '+573001110002'],
  ] as const) {
    await admin.query(
      `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [canal, TENANT, CUENTA, pn, tel],
    );
    await registrarEnDirectorio(pn, canal);
  }
  // El desacuerdo de la tarea 4f: la verdad dice REVOCADO, el directorio quedó en ACTIVO.
  await admin.query(`UPDATE canales SET estado = 'REVOCADO', revocado_en = now() WHERE id = $1`, [
    CANAL_REVOCADO,
  ]);

  await admin.query(
    `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
    [
      TENANT_B,
      'fixture-aislamiento-relay-' + TENANT_B.slice(-12),
      'Segunda agencia de la prueba del relay',
    ],
  );
  await admin.query(
    `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en) VALUES ($1, $2, $3, 'WABA B', now())`,
    [CUENTA_B, TENANT_B, 'waba-relay-' + CUENTA_B.slice(0, 8)],
  );
  await admin.query(
    `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en) VALUES ($1, $2, $3, $4, '+573001110003', now())`,
    [CANAL_B, TENANT_B, CUENTA_B, PN_B],
  );
  await registrarEnDirectorio(PN_B, CANAL_B, TENANT_B, CUENTA_B);
  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  app.use('/webhooks', (await import('express')).raw({ type: '*/*', limit: '1mb' }));
  await app.listen(0);
  base = await app.getUrl();

  // El trabajador, tal como lo ensambla `InboxWorkerModule`, con su propio rol.
  prismaWebhook = new PrismaWebhookService();
  await prismaWebhook.onModuleInit();
  caso = new ProcesarChange(
    new StagingPrisma(prismaWebhook),
    new BandejaPrisma(prismaWebhook, new ContactosDeCrm()),
  );
});

afterAll(async () => {
  await prismaWebhook?.onModuleDestroy();
  await app?.close();
  if (admin) {
    try {
      // Solo las recepciones de esta corrida (la tabla es global); sin esto se acumulaban.
      await admin.query('SET ROLE "viajapro_staging"');
      await admin.query('DELETE FROM recepciones_webhook_changes WHERE recepcion_id = ANY($1)', [
        RECEPCIONES_DE_LA_CORRIDA,
      ]);
      await admin.query('DELETE FROM recepciones_webhook WHERE recepcion_id = ANY($1)', [
        RECEPCIONES_DE_LA_CORRIDA,
      ]);
      await admin.query('RESET ROLE');
      await admin.query('SET ROLE "viajapro_enrutador"');
      await admin.query('DELETE FROM enrutamiento_canales WHERE tenant_resuelto_id = ANY($1)', [
        [TENANT, TENANT_B],
      ]);
      await admin.query('RESET ROLE');
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      // Especificador no literal: el limpiador es JS sin tipos y se comparte con el paquete de base de datos.
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await admin.query('BEGIN');
      await modulo.borrarTenants(admin, [TENANT, TENANT_B]);
      await admin.query('COMMIT');
    } finally {
      await admin.end();
    }
  }
});

describe('POST firmado -> trabajador -> mensajes', () => {
  it('un mensaje de un número ACTIVO llega a `mensajes` con su tenant', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(PN_ACTIVO, wamid);
    expect(await post(cuerpo)).toBe(200);

    const r = await caso.ejecutar(idDe(cuerpo), 0);
    expect(r).toEqual({ estado: 'PROCESADO', mensajesNuevos: 1, mensajesRepetidos: 0 });

    const m = await admin.query(
      `SELECT id, tenant_id, direccion::text, tipo::text, texto, conversacion_id FROM mensajes WHERE wamid = $1`,
      [wamid],
    );
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].tenant_id).toBe(TENANT);
    expect(m.rows[0].direccion).toBe('ENTRANTE');
    expect(m.rows[0].texto).toContain('San Andrés');

    const c = await admin.query(
      `SELECT c.tenant_id, c.canal_id, c.mensajes_sin_leer, c.ultimo_mensaje_direccion::text AS dir,
              k.telefono_e164, k.tenant_id AS k_tenant
         FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id
        WHERE c.id = $1`,
      [m.rows[0].conversacion_id],
    );
    expect(c.rows[0]).toMatchObject({
      tenant_id: TENANT,
      canal_id: CANAL_ACTIVO,
      k_tenant: TENANT,
      telefono_e164: '+573001112233',
      dir: 'ENTRANTE',
    });
    expect(c.rows[0].mensajes_sin_leer).toBeGreaterThanOrEqual(1);

    const ev = await admin.query(
      `SELECT payload::text AS p FROM outbox WHERE tenant_id = $1 AND agregado_id = $2`,
      [TENANT, m.rows[0].id],
    );
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0].p).not.toContain('573001112233');

    // Cerrado: el change resuelto y el contenido anulado.
    const ch = await admin.query(
      'SELECT estado::text AS e FROM recepciones_webhook_changes WHERE recepcion_id = $1',
      [idDe(cuerpo)],
    );
    expect(ch.rows[0].e).toBe('PROCESADO');
    expect(await payloadAnulado(cuerpo)).toBe(true);
  });

  it('el mismo wamid en un lote DISTINTO no duplica el mensaje (la garantía es el wamid)', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const uno = sobre(PN_ACTIVO, wamid);
    // Mismo wamid, cuerpo distinto: Meta reagrupó el lote. El hash difiere, el wamid no.
    const otro = Buffer.from(uno.toString('utf8').replace('"1760900000"', '"1760900001"'), 'utf8');
    expect(otro.equals(uno)).toBe(false);

    expect(await post(uno)).toBe(200);
    expect(await post(otro)).toBe(200);
    await caso.ejecutar(idDe(uno), 0);
    const segundo = await caso.ejecutar(idDe(otro), 0);

    expect(segundo).toEqual({ estado: 'PROCESADO', mensajesNuevos: 0, mensajesRepetidos: 1 });
    expect(await mensajesDe(wamid)).toBe(1);
  });

  it('procesar dos veces el mismo change no repite nada (reintento de la cola)', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(PN_ACTIVO, wamid);
    await post(cuerpo);
    await caso.ejecutar(idDe(cuerpo), 0);
    expect(await caso.ejecutar(idDe(cuerpo), 0)).toEqual({ estado: 'YA_RESUELTO' });
    expect(await mensajesDe(wamid)).toBe(1);
  });

  it('número desconocido: se descarta, contenido anulado, ninguna fila de negocio', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(PN_DESCONOCIDO, wamid);
    expect(await post(cuerpo)).toBe(200);
    expect(await caso.ejecutar(idDe(cuerpo), 0)).toEqual({
      estado: 'CLASIFICADO',
      motivo: 'DESCONOCIDO',
    });
    expect(await mensajesDe(wamid)).toBe(0);
    expect(await payloadAnulado(cuerpo)).toBe(true);
  });

  it('canal REVOCADO (directorio aún en ACTIVO, tarea 4f): se descarta sin filas de negocio', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const telefono = '573009998877';
    const cuerpo = sobre(PN_REVOCADO, wamid, telefono);
    expect(await post(cuerpo)).toBe(200);

    const r = await caso.ejecutar(idDe(cuerpo), 0);
    expect(r).toEqual({ estado: 'CLASIFICADO', motivo: 'REVOCADO' });
    expect(await mensajesDe(wamid)).toBe(0);
    // Ni siquiera el contacto: la rama revocada no crea nada, ni a medias.
    const k = await admin.query(
      'SELECT 1 FROM contactos WHERE tenant_id = $1 AND telefono_e164 = $2',
      [TENANT, `+${telefono}`],
    );
    expect(k.rows).toHaveLength(0);
    expect(await payloadAnulado(cuerpo)).toBe(true);
  });

  async function tenantsDe(wamid: string): Promise<string[]> {
    const r = await admin.query('SELECT tenant_id FROM mensajes WHERE wamid = $1', [wamid]);
    return r.rows.map((f: { tenant_id: string }) => f.tenant_id).sort();
  }

  it('un lote con changes de DOS agencias: cada uno se escribe bajo su tenant', async () => {
    // Un solo POST, dos `entry` de WABAs distintos: el caso que la documentación de Meta
    // confirma y que obliga a resolver el tenant por change y no por petición.
    const wA = `wamid.${randomUUID()}`;
    const wB = `wamid.${randomUUID()}`;
    const a = JSON.parse(sobre(PN_ACTIVO, wA).toString('utf8')) as { entry: unknown[] };
    const b = JSON.parse(sobre(PN_B, wB).toString('utf8')) as { entry: unknown[] };
    const lote = Buffer.from(JSON.stringify({ ...a, entry: [...a.entry, ...b.entry] }), 'utf8');

    expect(await post(lote)).toBe(200);
    const ra = await caso.ejecutar(idDe(lote), 0);
    const rb = await caso.ejecutar(idDe(lote), 1);

    expect(ra).toEqual({ estado: 'PROCESADO', mensajesNuevos: 1, mensajesRepetidos: 0 });
    expect(rb).toEqual({ estado: 'PROCESADO', mensajesNuevos: 1, mensajesRepetidos: 0 });
    expect(await tenantsDe(wA)).toEqual([TENANT]);
    expect(await tenantsDe(wB)).toEqual([TENANT_B]);
    // Los dos changes cerrados, y el contenido solo se anula al cerrar el último.
    expect(await payloadAnulado(lote)).toBe(true);
  });

  it('el mismo wamid en dos tenants: existen las dos filas (la unicidad es por tenant)', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const deA = sobre(PN_ACTIVO, wamid);
    const deB = sobre(PN_B, wamid);
    await post(deA);
    await post(deB);

    expect((await caso.ejecutar(idDe(deA), 0)).estado).toBe('PROCESADO');
    expect(await caso.ejecutar(idDe(deB), 0)).toEqual({
      estado: 'PROCESADO',
      mensajesNuevos: 1,
      mensajesRepetidos: 0,
    });
    expect(await tenantsDe(wamid)).toEqual([TENANT, TENANT_B].sort());
  });
});
