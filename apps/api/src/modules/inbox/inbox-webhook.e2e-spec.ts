/**
 * El `POST /webhooks/whatsapp` con la aplicación ensamblada y la base real.
 *
 * Qué afirma, de punta a punta y no con dobles:
 *   · firma inválida o ausente -> 403 y **ninguna fila**;
 *   · un mensaje firmado -> 200 y una fila de recepción con su `change`;
 *   · el mismo cuerpo dos veces (el reintento de Meta, R5) -> 200 y **una sola** fila;
 *   · lo guardado va cifrado: ni el teléfono ni el texto del viajero aparecen en la fila.
 *
 * **Lo que NO afirma, a propósito.** No resuelve el tenant: según el ADR-0008 §4 el `POST`
 * persiste el sobre cerrado ANTES de saber de qué agencia es, y resolver `phone_number_id`
 * (con `viajapro_webhook`) es trabajo del relay/trabajador. Por eso un número desconocido
 * también se guarda aquí, cifrado, y el trabajador lo clasifica y anula el payload. La
 * respuesta es idéntica en ambos casos: no filtra si el número existe.
 *
 * Los secretos son de ESTA prueba, inyectados en el proceso; no salen de aquí.
 */
import 'reflect-metadata';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { cuerpoCrudoDeWebhooks } from '../../shared/red/cuerpo-crudo-de-webhooks.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const SECRETO = randomBytes(24).toString('hex');
/** Marca de la corrida: el texto cambia, así que el hash del cuerpo es único y no choca. */
const MARCA = randomUUID();

let app: INestApplication;
let base: string;
/** Conexión de propietario, solo para comprobar y limpiar el staging. */
let admin: PrismaClient;
const creadas: Buffer[] = [];

function firmar(cuerpo: Buffer, secreto = SECRETO): string {
  return 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');
}

function idDe(cuerpo: Buffer): Buffer {
  return createHash('sha256').update(cuerpo).digest();
}

/** Un `messages` con la forma de la documentación de Meta, con tildes a propósito. */
function sobreDeMensaje(phoneNumberId: string, wamid: string): Buffer {
  const cuerpo = Buffer.from(
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
                contacts: [{ profile: { name: 'Viajero Ñandú' }, wa_id: '573001112233' }],
                messages: [
                  {
                    from: '573001112233',
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
  creadas.push(idDe(cuerpo));
  return cuerpo;
}

async function enviar(cuerpo: Buffer, firma?: string): Promise<Response> {
  return fetch(new URL('/webhooks/whatsapp', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(firma ? { 'x-hub-signature-256': firma } : {}),
    },
    body: cuerpo,
  });
}

async function contar(cuerpo: Buffer): Promise<{ recepciones: number; changes: number }> {
  const id = idDe(cuerpo);
  const [r] = await admin.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM public.recepciones_webhook WHERE recepcion_id = ${id}::bytea`;
  const [c] = await admin.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM public.recepciones_webhook_changes WHERE recepcion_id = ${id}::bytea`;
  return { recepciones: Number(r?.n ?? 0), changes: Number(c?.n ?? 0) };
}

beforeAll(async () => {
  process.env['META_APP_SECRET'] = SECRETO;
  process.env['WEBHOOK_PAYLOAD_KEY'] = randomBytes(32).toString('base64');
  process.env['WEBHOOK_PAYLOAD_KEY_VERSION'] = '1';

  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  // Igual que `main.ts`: sin el cuerpo crudo la firma no se puede verificar.
  app.use('/webhooks', cuerpoCrudoDeWebhooks());
  await app.listen(0);
  base = await app.getUrl();
});

afterAll(async () => {
  // Limpieza por identificador, solo de lo que creó esta corrida.
  for (const id of creadas) {
    await admin.$executeRaw`DELETE FROM public.recepciones_webhook_changes WHERE recepcion_id = ${id}::bytea`;
    await admin.$executeRaw`DELETE FROM public.recepciones_webhook WHERE recepcion_id = ${id}::bytea`;
  }
  await admin?.$disconnect();
  await app?.close();
});

describe('POST /webhooks/whatsapp', () => {
  it('firma inválida -> 403 y ninguna fila', async () => {
    const cuerpo = sobreDeMensaje('111111111111111', `wamid.${randomUUID()}`);
    const r = await enviar(cuerpo, firmar(cuerpo, 'otro-secreto'));
    expect(r.status).toBe(403);
    expect(await contar(cuerpo)).toEqual({ recepciones: 0, changes: 0 });
  });

  it('un cuerpo de más de 1 MB -> 413 y ninguna fila, aunque la firma sea válida (AUD-017)', async () => {
    const grande = Buffer.alloc(1024 * 1024 + 1, 0x61);
    creadas.push(idDe(grande));
    const r = await enviar(grande, firmar(grande));
    expect(r.status).toBe(413);
    expect(await contar(grande)).toEqual({ recepciones: 0, changes: 0 });
  });

  it('el tope se aplica ANTES de mirar la firma: sin firma también es 413, no 403 (AUD-017)', async () => {
    const grande = Buffer.alloc(1024 * 1024 + 1, 0x61);
    const r = await enviar(grande);
    expect(r.status).toBe(413);
  });

  it('un cuerpo justo en el tope (1 MB) no se rechaza por tamaño (AUD-017)', async () => {
    const justo = Buffer.alloc(1024 * 1024, 0x61);
    const r = await enviar(justo, firmar(justo));
    expect(r.status).not.toBe(413);
  });

  it('sin cabecera de firma -> 403 y ninguna fila', async () => {
    const cuerpo = sobreDeMensaje('111111111111111', `wamid.${randomUUID()}`);
    const r = await enviar(cuerpo);
    expect(r.status).toBe(403);
    expect(await contar(cuerpo)).toEqual({ recepciones: 0, changes: 0 });
  });

  it('mensaje válido -> 200 y una fila con su change', async () => {
    const cuerpo = sobreDeMensaje('111111111111111', `wamid.${randomUUID()}`);
    const r = await enviar(cuerpo, firmar(cuerpo));
    expect(r.status).toBe(200);
    expect(await contar(cuerpo)).toEqual({ recepciones: 1, changes: 1 });
  });

  it('el mismo wamid reintentado dos veces -> una sola fila', async () => {
    const cuerpo = sobreDeMensaje('111111111111111', `wamid.${randomUUID()}`);
    const primera = await enviar(cuerpo, firmar(cuerpo));
    const segunda = await enviar(cuerpo, firmar(cuerpo));
    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await contar(cuerpo)).toEqual({ recepciones: 1, changes: 1 });
  });

  it('número desconocido: misma respuesta que uno conocido, sin pistas', async () => {
    const cuerpo = sobreDeMensaje('999999999999999', `wamid.${randomUUID()}`);
    const r = await enviar(cuerpo, firmar(cuerpo));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('');
  });

  it('lo guardado va cifrado: ni teléfono ni texto aparecen en la fila', async () => {
    const cuerpo = sobreDeMensaje('111111111111111', `wamid.${randomUUID()}`);
    await enviar(cuerpo, firmar(cuerpo));
    const id = idDe(cuerpo);
    const [fila] = await admin.$queryRaw<Array<{ p: Buffer }>>`
      SELECT payload_cifrado AS p FROM public.recepciones_webhook WHERE recepcion_id = ${id}::bytea`;
    expect(fila?.p.length).toBeGreaterThan(0);
    expect(fila?.p.includes(Buffer.from('573001112233'))).toBe(false);
    expect(fila?.p.includes(Buffer.from(MARCA))).toBe(false);
  });
});
