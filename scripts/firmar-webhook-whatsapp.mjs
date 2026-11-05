#!/usr/bin/env node
/**
 * Envia a la API un webhook de WhatsApp FIRMADO como lo firma Meta (HMAC-SHA256 del cuerpo en
 * crudo con META_APP_SECRET, cabecera `x-hub-signature-256: sha256=<hex>`). Es para probar el
 * camino webhook -> cola en proceso -> mensajes -> bandeja sin Meta y sin tunel.
 *
 *   node scripts/firmar-webhook-whatsapp.mjs [--texto "Hola"] [--de 573001112233] [--url http://localhost:3333]
 *
 * Lee META_APP_SECRET y el id del numero de prueba de `.env.unico` (o del entorno). El numero debe
 * estar ligado a la agencia demo: `docker compose ... run --rm preparar bash /preparar.sh canal`
 * (runbook-modo-unico.md §4). Cada ejecucion usa un `wamid` nuevo; con `--wamid` se reenvia el
 * MISMO mensaje para comprobar la idempotencia (R5): no debe duplicarse.
 *
 * Solo para desarrollo: el secreto y los ids son los del compose local.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function arg(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : porOmision;
}

function delEnv(clave) {
  if (process.env[clave]) return process.env[clave];
  if (!existsSync('.env.unico')) return undefined;
  const linea = readFileSync('.env.unico', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${clave}=`));
  return linea?.slice(clave.length + 1);
}

const secreto = delEnv('META_APP_SECRET');
if (!secreto) {
  console.error('Falta META_APP_SECRET (ejecuta desde la raiz, con .env.unico presente).');
  process.exit(1);
}
const url = new URL('/webhooks/whatsapp', arg('url', 'http://localhost:3333'));
const phoneNumberId = delEnv('META_PHONE_NUMBER_ID_PRUEBA') ?? '100000000000001';
const de = arg('de', '573001112233');
const wamid = arg('wamid', `wamid.PRUEBA${randomBytes(8).toString('hex')}`);
const texto = arg('texto', `Hola desde la prueba firmada ${new Date().toISOString()}`);

const cuerpo = Buffer.from(
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '100000000000002',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Viajero de prueba' }, wa_id: de }],
              messages: [
                {
                  from: de,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: texto },
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
const firma = 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');

const r = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
  body: cuerpo,
});
console.log(`POST ${url.pathname} -> ${r.status}   wamid=${wamid}`);
if (r.status !== 200) {
  console.error(await r.text());
  process.exit(1);
}
