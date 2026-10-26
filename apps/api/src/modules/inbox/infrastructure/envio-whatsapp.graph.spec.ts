/**
 * El adaptador REAL de la Graph API contra un servidor HTTP falso levantado aquí mismo, en
 * 127.0.0.1. **Ninguna petición sale de la máquina**: ni Meta ni ninguna otra red (ADR-0018).
 *
 * El servidor imita lo que documenta Meta (§6.1 y §9 de la integración): la respuesta de éxito con
 * `messages[0].id` y el sobre de error `{ error: { code, message, ... } }`. Cada número de prueba
 * (`phone_number_id` de la ruta) elige un comportamiento.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PedidoDeTexto } from '../application/puertos-de-envio.js';
import {
  CredencialInvalidaError,
  EnvioSinConfirmarError,
  FueraDeVentanaError,
  LimiteDeTasaError,
  MetaInalcanzableError,
} from '../domain/errores-de-envio.js';
import { EnvioWhatsappGraph } from './envio-whatsapp.graph.js';

interface Recibido {
  url: string;
  autorizacion: string | undefined;
  cuerpo: Record<string, unknown>;
}

let servidor: Server;
let base: string;
let recibidos: Recibido[] = [];
/** Cuántas veces responde 429 el número `limitado` antes de aceptar. */
let limitesPendientes = 0;

function errorDeMeta(res: ServerResponse, http: number, code: number, message: string): void {
  res.writeHead(http, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: {
        message,
        type: 'OAuthException',
        code,
        // Meta puede repetir aquí el número del destinatario: el adaptador no debe leerlo.
        error_data: { messaging_product: 'whatsapp', details: 'detalle +573001234567' },
        fbtrace_id: 'Atrace',
      },
    }),
  );
}

function atender(req: IncomingMessage, res: ServerResponse): void {
  let crudo = '';
  req.on('data', (c: Buffer) => (crudo += c.toString('utf8')));
  req.on('end', () => {
    recibidos.push({
      url: req.url ?? '',
      autorizacion: req.headers.authorization,
      cuerpo: JSON.parse(crudo || '{}') as Record<string, unknown>,
    });
    const numero = (req.url ?? '').split('/')[2];
    switch (numero) {
      case 'exito':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            messaging_product: 'whatsapp',
            contacts: [{ input: '573001234567', wa_id: '573001234567' }],
            messages: [{ id: 'wamid.HBgMNTczMDAxMjM0NTY3FQIAERgSRkFLRQA=' }],
          }),
        );
        return;
      case 'fuera-de-ventana':
        errorDeMeta(res, 400, 131047, 'Re-engagement message');
        return;
      case 'limitado':
        if (limitesPendientes > 0) {
          limitesPendientes -= 1;
          errorDeMeta(res, 429, 130429, 'Rate limit hit');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: [{ id: 'wamid.TRAS-LIMITE' }] }));
        return;
      case 'token-invalido':
        errorDeMeta(res, 401, 190, 'Error validating access token: Session has expired');
        return;
      case 'lento':
        // No responde a tiempo: el adaptador corta por timeout.
        setTimeout(() => {
          res.writeHead(200);
          res.end('{}');
        }, 2_000);
        return;
      case 'sin-id':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messaging_product: 'whatsapp' }));
        return;
      default:
        res.writeHead(404);
        res.end();
    }
  });
}

beforeAll(async () => {
  servidor = createServer(atender);
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

beforeEach(() => {
  recibidos = [];
  limitesPendientes = 0;
});

const esperas: number[] = [];
const adaptador = (opciones: { baseUrl?: string; timeoutMs?: number } = {}): EnvioWhatsappGraph =>
  new EnvioWhatsappGraph({
    baseUrl: opciones.baseUrl ?? base,
    version: 'v26.0',
    timeoutMs: opciones.timeoutMs ?? 1_000,
    reintentos: 2,
    esperaBaseMs: 10,
    dormir: (ms) => {
      esperas.push(ms);
      return Promise.resolve();
    },
  });

const pedido = (numero: string): PedidoDeTexto => ({
  credencial: { phoneNumberId: numero, token: 'EAAG-token-de-prueba' },
  para: '+573001234567',
  texto: 'Hola Sofía, te comparto el plan.',
  referencia: '01932000-0000-7000-8000-0000000000aa',
});

describe('EnvioWhatsappGraph contra una Graph API falsa', () => {
  it('éxito: la forma exacta de la petición y el wamid de la respuesta', async () => {
    const r = await adaptador().enviarTexto(pedido('exito'));
    expect(r).toEqual({ wamid: 'wamid.HBgMNTczMDAxMjM0NTY3FQIAERgSRkFLRQA=' });
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]?.url).toBe('/v26.0/exito/messages');
    expect(recibidos[0]?.autorizacion).toBe('Bearer EAAG-token-de-prueba');
    expect(recibidos[0]?.cuerpo).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '573001234567',
      type: 'text',
      text: { body: 'Hola Sofía, te comparto el plan.', preview_url: false },
      biz_opaque_callback_data: '01932000-0000-7000-8000-0000000000aa',
    });
  });

  it('131047: FueraDeVentanaError, sin reintentar', async () => {
    const e = await adaptador()
      .enviarTexto(pedido('fuera-de-ventana'))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FueraDeVentanaError);
    expect((e as FueraDeVentanaError).codigoMeta).toBe(131047);
    expect(recibidos).toHaveLength(1);
  });

  it('429 / 130429: reintenta con espera creciente y sale cuando Meta lo acepta', async () => {
    esperas.length = 0;
    limitesPendientes = 2;
    const r = await adaptador().enviarTexto(pedido('limitado'));
    expect(r).toEqual({ wamid: 'wamid.TRAS-LIMITE' });
    expect(recibidos).toHaveLength(3);
    expect(esperas).toEqual([10, 30]);
  });

  it('429 persistente: agotados los reintentos cortos, LimiteDeTasaError para la cola', async () => {
    limitesPendientes = 10;
    const e = await adaptador()
      .enviarTexto(pedido('limitado'))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LimiteDeTasaError);
    expect((e as LimiteDeTasaError).reintentable).toBe(true);
    expect(recibidos).toHaveLength(3);
  });

  it('token inválido (190): CredencialInvalidaError, sin reintentar y sin filtrar el detalle', async () => {
    const e = await adaptador()
      .enviarTexto(pedido('token-invalido'))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CredencialInvalidaError);
    expect(recibidos).toHaveLength(1);
    const texto = JSON.stringify({ m: (e as Error).message, ...(e as object) });
    expect(texto).not.toContain('+573001234567');
    expect(texto).not.toContain('EAAG-token-de-prueba');
  });

  it('timeout: EnvioSinConfirmarError y NUNCA reintenta (podría duplicar)', async () => {
    const e = await adaptador({ timeoutMs: 150 })
      .enviarTexto(pedido('lento'))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EnvioSinConfirmarError);
    expect(recibidos).toHaveLength(1);
  });

  it('200 sin wamid legible: sin confirmar, no un éxito inventado', async () => {
    const e = await adaptador()
      .enviarTexto(pedido('sin-id'))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EnvioSinConfirmarError);
  });

  it('conexión rechazada (la petición no salió): reintentable', async () => {
    // Un puerto cerrado en la propia máquina: ECONNREFUSED sin tocar ninguna red.
    const cerrado = createServer();
    await new Promise<void>((listo) => cerrado.listen(0, '127.0.0.1', listo));
    const puerto = (cerrado.address() as AddressInfo).port;
    await new Promise<void>((listo) => cerrado.close(() => listo()));

    const e = await adaptador({ baseUrl: `http://127.0.0.1:${puerto}` })
      .enviarTexto(pedido('exito'))
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MetaInalcanzableError);
    expect((e as MetaInalcanzableError).reintentable).toBe(true);
  });
});
