/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: fetch simulado, nunca red */
/**
 * `CorreoPostmark` con `fetch` simulado. Ninguna prueba toca Postmark (ADR-0012).
 */
import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MensajeDeCorreo } from '../../shared/puertos/puerto-de-correo.js';
import { ErrorDeCorreoDefinitivo, ErrorDeCorreoTransitorio } from './domain/errores-de-correo.js';
import { sellarCorreo } from './domain/sellado-de-correo.js';
import { CorreoPostmark, URL_DE_POSTMARK } from './infrastructure/correo.postmark.js';
import { crearCorreo, validarConfiguracionDeCorreo } from './infrastructure/crear-correo.js';
import { ConsumidorDeCorreo } from './interface/consumidor-de-correo.js';

const mensaje: MensajeDeCorreo = {
  para: 'maria.perez@agencia.test',
  asunto: 'Tu codigo',
  texto: 'Codigo secreto 987654',
};

interface Llamada {
  url: string;
  init: RequestInit;
}

function conRespuesta(
  estado: number,
  cuerpo: unknown,
): { fetch: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
      status: estado,
    });
  }) as unknown as typeof fetch;
  return { fetch: f, llamadas };
}

const correo = (f: typeof fetch): CorreoPostmark =>
  new CorreoPostmark({
    token: 'tok-prueba',
    remitente: 'X <n@x.test>',
    stream: 'outbound',
    fetch: f,
  });

afterEach(() => vi.restoreAllMocks());

describe('CorreoPostmark', () => {
  it('envia con la forma de la API: cabecera de token, sin seguimiento, stream outbound', async () => {
    const { fetch: f, llamadas } = conRespuesta(200, {
      ErrorCode: 0,
      Message: 'OK',
      MessageID: 'm1',
    });
    await correo(f).enviar(mensaje);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.url).toBe(URL_DE_POSTMARK);
    const init = llamadas[0]?.init as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Postmark-Server-Token']).toBe('tok-prueba');
    expect(JSON.parse(init.body as string)).toEqual({
      From: 'X <n@x.test>',
      To: mensaje.para,
      Subject: mensaje.asunto,
      TextBody: mensaje.texto,
      TrackOpens: false,
      TrackLinks: 'None',
      MessageStream: 'outbound',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [401, 10],
    [422, 406],
    [422, 300],
    [422, 413],
  ])('un %i (ErrorCode %i) es definitivo: no se reintenta', async (estado, codigo) => {
    const { fetch: f } = conRespuesta(estado, { ErrorCode: codigo, Message: 'x' });
    const error = await correo(f)
      .enviar(mensaje)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeCorreoDefinitivo);
    expect((error as ErrorDeCorreoDefinitivo).codigo).toBe(codigo);
  });

  it.each([
    [429, 0],
    [500, 101],
    [503, 100],
  ])('un %i es transitorio: la cola reintenta', async (estado, codigo) => {
    const { fetch: f } = conRespuesta(estado, { ErrorCode: codigo, Message: 'x' });
    const error = await correo(f)
      .enviar(mensaje)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeCorreoTransitorio);
    expect((error as ErrorDeCorreoTransitorio).codigo).toBe(codigo);
  });

  it('un 5xx sin cuerpo JSON es transitorio y sin codigo', async () => {
    const { fetch: f } = conRespuesta(502, '<html>bad gateway</html>');
    const error = (await correo(f)
      .enviar(mensaje)
      .catch((e: unknown) => e)) as ErrorDeCorreoTransitorio;
    expect(error).toBeInstanceOf(ErrorDeCorreoTransitorio);
    expect(error.codigo).toBeNull();
  });

  it('un fallo de red es transitorio y no arrastra el error original', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed a: maria.perez@agencia.test');
    }) as unknown as typeof fetch;
    const error = (await correo(f)
      .enviar(mensaje)
      .catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(ErrorDeCorreoTransitorio);
    expect(error.message).not.toContain('maria');
  });

  it('un timeout es transitorio', async () => {
    const f = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, rechazar) => {
        init.signal?.addEventListener('abort', () => rechazar(new Error('abortado')));
      })) as unknown as typeof fetch;
    const lento = new CorreoPostmark({
      token: 't',
      remitente: 'x@x.test',
      stream: 'outbound',
      fetch: f,
      timeoutMs: 20,
    });
    await expect(lento.enviar(mensaje)).rejects.toBeInstanceOf(ErrorDeCorreoTransitorio);
  });
});

describe('configuracion de CorreoPostmark', () => {
  it('postmark sin token aborta, al crear el adaptador y en la validacion de la API', () => {
    expect(() => crearCorreo({ MAIL_PROVIDER: 'postmark' })).toThrow(/POSTMARK_SERVER_TOKEN/);
    expect(() => crearCorreo({ MAIL_PROVIDER: 'postmark', POSTMARK_SERVER_TOKEN: '' })).toThrow(
      /POSTMARK_SERVER_TOKEN/,
    );
    expect(() => validarConfiguracionDeCorreo({ MAIL_PROVIDER: 'postmark' })).toThrow(
      /POSTMARK_SERVER_TOKEN/,
    );
  });

  it('con token se construye, tambien en produccion; no hay respaldo a Mailpit', () => {
    const c = crearCorreo({
      MAIL_PROVIDER: 'postmark',
      POSTMARK_SERVER_TOKEN: 't',
      APP_ENV: 'production',
    });
    expect(c).toBeInstanceOf(CorreoPostmark);
    expect(() => crearCorreo({ MAIL_PROVIDER: 'mailpit', APP_ENV: 'production' })).toThrow(/local/);
  });
});

describe('ConsumidorDeCorreo con Postmark: registros sin PII (R10)', () => {
  const CLAVE = randomBytes(32);
  const consumidorCon = (f: typeof fetch): ConsumidorDeCorreo => {
    const c = new ConsumidorDeCorreo(correo(f));
    c.clave = CLAVE;
    return c;
  };
  const trabajo = (id: string): unknown => sellarCorreo(mensaje, CLAVE, id);

  it('un 422 se registra con ErrorCode e id del trabajo, sin Message, destinatario ni contenido', async () => {
    const { fetch: f } = conRespuesta(422, {
      ErrorCode: 406,
      Message: 'Address maria.perez@agencia.test is inactive',
    });
    const espias = [
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
    ];
    const error = await consumidorCon(f)
      .atender(trabajo('job-42'), 'job-42')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnrecoverableError);
    const salida =
      JSON.stringify(espias.map((e) => e.mock.calls)) + String((error as Error).message);
    expect(salida).toContain('job-42');
    expect(salida).toContain('406');
    for (const prohibido of [
      'maria',
      'agencia.test',
      'inactive',
      'Address',
      '987654',
      'Tu codigo',
    ]) {
      expect(salida).not.toContain(prohibido);
    }
  });

  it('un 503 se reintenta (no es UnrecoverableError) y tampoco registra PII', async () => {
    const { fetch: f } = conRespuesta(503, {
      ErrorCode: 100,
      Message: 'para maria.perez@agencia.test',
    });
    const espia = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = await consumidorCon(f)
      .atender(trabajo('job-7'), 'job-7')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
    const salida = JSON.stringify(espia.mock.calls);
    expect(salida).toContain('100');
    expect(salida).not.toContain('maria');
  });
});
