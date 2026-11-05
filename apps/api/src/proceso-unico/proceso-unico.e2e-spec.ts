/**
 * El modo `unico` de punta a punta contra una base REAL y SIN Redis (ADR-0019): un solo proceso
 * con dos contextos de Nest; POST firmado -> cola en proceso -> `ProcesarChange` -> `mensajes`.
 *
 * Afirma:
 *   · el proceso arranca con `MODO_DESPLIEGUE=unico` y SIN `REDIS_URL`;
 *   · el mensaje llega a `mensajes` en segundos, sin esperar a ningún barrido (el barrido de
 *     seguridad es de 60 minutos);
 *   · el mismo POST reintentado (R5) no duplica ni la recepción ni el mensaje;
 *   · el cierre ordenado termina.
 *
 * Como las demás e2e, necesita las cuatro cadenas de base de datos del entorno; corre en CI.
 * Equivalente en modo `escalado`: `inbox-bullmq.e2e-spec.ts`.
 */
import 'reflect-metadata';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claveDeEnrutamiento } from '../modules/inbox/domain/clave-de-enrutamiento.js';
import type { ProcesoUnico } from './arrancar-unico.js';

const SECRETO = randomBytes(24).toString('hex');
const MARCA = randomUUID();
const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';
const TENANT = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const CUENTA = randomUUID();
const CANAL = randomUUID();
const PN = String(Math.floor(Math.random() * 9e14) + 1e14);
const TELEFONO = '573009998866';

let proceso: ProcesoUnico;
let base: string;
let admin: Client;
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
                contacts: [{ profile: { name: 'Viajero Unico' }, wa_id: TELEFONO }],
                messages: [
                  {
                    from: TELEFONO,
                    id: wamid,
                    timestamp: '1760900000',
                    text: { body: `Hola desde el proceso unico ${MARCA}` },
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

async function mensajesDe(wamid: string): Promise<Array<{ tenant_id: string }>> {
  const r = await admin.query('SELECT tenant_id FROM mensajes WHERE wamid = $1', [wamid]);
  return r.rows as Array<{ tenant_id: string }>;
}

async function esperar<T>(que: () => Promise<T | undefined>, ms = 20_000): Promise<T> {
  const limite = Date.now() + ms;
  for (;;) {
    const v = await que();
    if (v !== undefined) return v;
    if (Date.now() > limite) throw new Error('Se agotó la espera de la condición.');
    await dormir(200);
  }
}

describe('modo unico: un proceso, sin Redis, base real', () => {
  beforeAll(async () => {
    if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
    process.env['MODO_DESPLIEGUE'] = 'unico';
    delete process.env['REDIS_URL'];
    process.env['META_APP_SECRET'] = SECRETO;
    process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
    process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';
    process.env['API_PORT'] = '0';

    admin = new Client({ connectionString: process.env['DATABASE_URL'] });
    await admin.connect();
    const bd = await admin.query('SELECT current_database() AS db');
    if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);

    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [TENANT, `fixture-aislamiento-unico-${TENANT.slice(-12)}`, 'Agencia de la prueba unica'],
    );
    await admin.query(
      `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en) VALUES ($1, $2, $3, 'WABA unico', now())`,
      [CUENTA, TENANT, `waba-unico-${CUENTA.slice(0, 8)}`],
    );
    await admin.query(
      `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en) VALUES ($1, $2, $3, $4, '+573001110008', now())`,
      [CANAL, TENANT, CUENTA, PN],
    );
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_altas"');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [TENANT]);
      await admin.query(
        `SELECT registrar_enrutamiento($1, $2::smallint, $3, $4, $5,
                                       'ACTIVO'::estado_enrutamiento, NULL, $6)`,
        [claveDeEnrutamiento(PIMIENTA, 'pn', PN), 1, TENANT, CANAL, CUENTA, 'alta e2e unico'],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }

    Logger.overrideLogger(false);
    // Import dinámico, DESPUÉS de fijar el entorno: los módulos eligen sus adaptadores al cargarse.
    const { arrancarUnico } = await import('./arrancar-unico.js');
    proceso = await arrancarUnico();
    base = await proceso.api.getUrl();
  });

  afterAll(async () => {
    await proceso?.cerrar();
    for (const k of [
      'MODO_DESPLIEGUE',
      'REDIS_URL',
      'META_APP_SECRET',
      'WEBHOOK_PAYLOAD_KEY',
      'WEBHOOK_PAYLOAD_KEY_VERSION',
      'API_PORT',
    ]) {
      if (entorno[k] === undefined) delete process.env[k];
      else process.env[k] = entorno[k];
    }
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
        const ruta = '../../../../packages/database/scripts/borrar-tenants.mjs';
        const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
        await admin.query('BEGIN');
        await modulo.borrarTenants(admin, [TENANT]);
        await admin.query('COMMIT');
      } finally {
        await admin.end();
      }
    }
  });

  it('arrancó sin REDIS_URL', () => {
    expect(process.env['REDIS_URL']).toBeUndefined();
    expect(proceso.puerto).toBe(0);
    expect(base).toMatch(/^http/);
  });

  it('el POST llega a mensajes en el momento, y el reintento de Meta no duplica (R5)', async () => {
    const wamid = `wamid.${randomUUID()}`;
    const cuerpo = sobre(wamid);

    expect(await post(cuerpo)).toBe(200);
    // El barrido de seguridad es de 60 minutos: si esto llega, fue por el despacho en proceso.
    const filas = await esperar(async () => {
      const f = await mensajesDe(wamid);
      return f.length > 0 ? f : undefined;
    });
    expect(filas).toEqual([{ tenant_id: TENANT }]);

    expect(await post(cuerpo)).toBe(200);
    await dormir(1_500);
    expect(await mensajesDe(wamid)).toHaveLength(1);
    const r = await admin.query(
      'SELECT count(*)::int AS n FROM recepciones_webhook WHERE recepcion_id = $1',
      [idDe(cuerpo)],
    );
    expect(r.rows[0].n).toBe(1);
  });
});
