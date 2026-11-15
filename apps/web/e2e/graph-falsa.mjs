#!/usr/bin/env node
/**
 * Graph API de Meta FALSA para la suite de navegador (job `navegador` de ci.yml). Sin dependencias.
 *
 * La API de verdad (`EnvioWhatsappGraph`) hace `POST {META_GRAPH_BASE_URL}/{version}/{phone_number_id}/messages`
 * con `Authorization: Bearer <token>` y espera `{ messages: [{ id: 'wamid...' }] }`. Este servidor
 * responde eso y REGISTRA lo recibido para que la prueba lo consulte:
 *
 *   POST /:version/:phoneNumberId/messages   como Graph; 200 con un wamid unico
 *   GET  /_enviados                          JSON con lo recibido (nunca incluye el token)
 *   DELETE /_enviados                        vacia el registro
 *   GET  /_salud                             200 'ok' (para esperar el arranque)
 *
 * Solo escucha en 127.0.0.1. Puerto: GRAPH_FALSA_PORT (4010 por omision).
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PUERTO = Number(process.env.GRAPH_FALSA_PORT ?? 4010);
const TOPE_CUERPO = 64 * 1024;
const enviados = [];

function responder(res, estado, cuerpo) {
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'content-type': typeof cuerpo === 'string' ? 'text/plain' : 'application/json',
  });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let total = 0;
    req.on('data', (t) => {
      total += t.length;
      if (total > TOPE_CUERPO) {
        rechazar(new Error('cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => resolver(Buffer.concat(trozos).toString('utf8')));
    req.on('error', rechazar);
  });
}

const servidor = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && pathname === '/_salud') return responder(res, 200, 'ok');
  if (req.method === 'GET' && pathname === '/_enviados') return responder(res, 200, enviados);
  if (req.method === 'DELETE' && pathname === '/_enviados') {
    enviados.length = 0;
    return responder(res, 200, { ok: true });
  }

  const ruta = /^\/(v[\d.]+)\/([^/]+)\/messages$/.exec(pathname);
  if (req.method === 'POST' && ruta) {
    let cuerpo;
    try {
      cuerpo = JSON.parse(await leerCuerpo(req));
    } catch {
      return responder(res, 400, { error: { message: 'JSON invalido', code: 100 } });
    }
    const autorizacion = String(req.headers.authorization ?? '');
    // Como Graph: sin bearer es un error de token (190). El token jamas se guarda.
    if (!/^Bearer \S+$/.test(autorizacion)) {
      return responder(res, 401, { error: { message: 'Token ausente', code: 190 } });
    }
    const wamid = `wamid.FALSA${randomBytes(12).toString('hex')}`;
    enviados.push({
      version: ruta[1],
      phoneNumberId: decodeURIComponent(ruta[2]),
      para: cuerpo?.to ?? null,
      tipo: cuerpo?.type ?? null,
      texto: cuerpo?.text?.body ?? null,
      referencia: cuerpo?.biz_opaque_callback_data ?? null,
      wamid,
      recibidoEn: new Date().toISOString(),
    });
    return responder(res, 200, {
      messaging_product: 'whatsapp',
      contacts: [{ input: cuerpo?.to ?? '', wa_id: cuerpo?.to ?? '' }],
      messages: [{ id: wamid }],
    });
  }

  return responder(res, 404, { error: { message: 'No existe', code: 100 } });
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Graph falsa escuchando en http://127.0.0.1:${PUERTO}`);
});
for (const senal of ['SIGINT', 'SIGTERM'])
  process.on(senal, () => servidor.close(() => process.exit(0)));
