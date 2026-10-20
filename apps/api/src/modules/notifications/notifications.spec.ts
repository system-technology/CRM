/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * El correo detrás de su puerto: adaptadores, cola en memoria y consumidor. Sin red ni Redis; el
 * recorrido por BullMQ real está en `notifications-bullmq.e2e-spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { MensajeDeCorreo } from '../../shared/puertos/puerto-de-correo.js';
import { PuertoCorreo } from './domain/puerto-correo.js';
import { ColaDeCorreoEnMemoria } from './infrastructure/cola-de-correo.en-memoria.js';
import { CorreoEnMemoria } from './infrastructure/correo.en-memoria.js';
import { CorreoMailpit } from './infrastructure/correo.mailpit.js';
import { crearCorreo } from './infrastructure/crear-correo.js';
import { abrirCorreo, resolverClaveDeCorreo, sellarCorreo } from './domain/sellado-de-correo.js';
import { ConsumidorDeCorreo } from './interface/consumidor-de-correo.js';
import { randomBytes } from 'node:crypto';

const mensaje: MensajeDeCorreo = {
  para: 'a@b.test',
  asunto: 'Hola',
  texto: 'Cuerpo secreto 123456',
};

describe('crearCorreo', () => {
  it('memoria y mailpit (solo en local) tienen adaptador', () => {
    expect(crearCorreo({ MAIL_PROVIDER: 'memoria' })).toBeInstanceOf(CorreoEnMemoria);
    expect(crearCorreo({ MAIL_PROVIDER: 'mailpit', APP_ENV: 'local' })).toBeInstanceOf(
      CorreoMailpit,
    );
  });

  it('mailpit se niega fuera de APP_ENV=local', () => {
    for (const env of [undefined, 'dev', 'staging', 'production']) {
      expect(() => crearCorreo({ MAIL_PROVIDER: 'mailpit', APP_ENV: env })).toThrow(/local/);
    }
  });

  it('cualquier otro proveedor se niega: el de producción espera su ADR', () => {
    for (const p of [undefined, '', 'resend', 'ses', 'smtp']) {
      expect(() => crearCorreo({ MAIL_PROVIDER: p, APP_ENV: 'local' })).toThrow(
        /no tiene adaptador/,
      );
    }
  });
});

describe('CorreoMailpit', () => {
  it('entrega por SMTP con el remitente configurado', async () => {
    const enviados: unknown[] = [];
    const correo = new CorreoMailpit(
      { sendMail: async (o) => void enviados.push(o) },
      'ViajaPro <no-reply@x.test>',
    );
    await correo.enviar(mensaje);
    expect(enviados).toEqual([
      { from: 'ViajaPro <no-reply@x.test>', to: 'a@b.test', subject: 'Hola', text: mensaje.texto },
    ]);
  });
});

describe('ColaDeCorreoEnMemoria', () => {
  it('entrega por el puerto y deduplica por clave de idempotencia (R5)', async () => {
    const correo = new CorreoEnMemoria();
    const cola = new ColaDeCorreoEnMemoria(correo);
    await cola.encolar(mensaje, 'clave-1');
    await cola.encolar(mensaje, 'clave-1');
    await cola.encolar(mensaje, 'clave-2');
    expect(correo.enviados).toHaveLength(2);
    expect(correo.para('A@B.test')).toHaveLength(2);
  });
});

const CLAVE = randomBytes(32);
const consumidor = (correo: PuertoCorreo): ConsumidorDeCorreo => {
  const c = new ConsumidorDeCorreo(correo);
  c.clave = CLAVE;
  return c;
};

describe('sellado del trabajo de correo (AES-256-GCM)', () => {
  it('lo que hay en Redis no revela el mensaje, y se abre con la clave', () => {
    const sellado = sellarCorreo(mensaje, CLAVE, 'trabajo-1');
    const texto = JSON.stringify(sellado);
    expect(texto).not.toContain('123456');
    expect(texto).not.toContain('a@b.test');
    expect(texto).not.toContain('Cuerpo secreto');
    expect(abrirCorreo(sellado, CLAVE, 'trabajo-1')).toEqual(mensaje);
  });

  it('dos cifrados del mismo mensaje difieren (nonce aleatorio)', () => {
    expect(sellarCorreo(mensaje, CLAVE, 'x').cifrado).not.toBe(
      sellarCorreo(mensaje, CLAVE, 'x').cifrado,
    );
  });

  it('no se abre con otra clave, ni bajo otro identificador de trabajo, ni manipulado', () => {
    const sellado = sellarCorreo(mensaje, CLAVE, 'trabajo-1');
    expect(() => abrirCorreo(sellado, randomBytes(32), 'trabajo-1')).toThrow();
    expect(() => abrirCorreo(sellado, CLAVE, 'trabajo-2')).toThrow();
    const roto = { ...sellado, cifrado: Buffer.from('otra cosa').toString('base64') };
    expect(() => abrirCorreo(roto, CLAVE, 'trabajo-1')).toThrow();
  });

  it('la clave no tiene respaldo y debe medir 32 bytes', () => {
    expect(() => resolverClaveDeCorreo({})).toThrow(/CORREO_PAYLOAD_KEY/);
    expect(() => resolverClaveDeCorreo({ CORREO_PAYLOAD_KEY: 'corta' })).toThrow(/32 bytes/);
    expect(resolverClaveDeCorreo({ CORREO_PAYLOAD_KEY: CLAVE.toString('hex') })).toEqual(CLAVE);
    expect(resolverClaveDeCorreo({ CORREO_PAYLOAD_KEY: CLAVE.toString('base64') })).toEqual(CLAVE);
  });
});

describe('la cola de correo', () => {
  it('borra los trabajos al completarse Y al fallar del todo (llevan un secreto)', async () => {
    const { OPCIONES_DE_TRABAJO_DE_CORREO } =
      await import('./infrastructure/cola-de-correo.bullmq.js');
    expect(OPCIONES_DE_TRABAJO_DE_CORREO.removeOnComplete).toBe(true);
    expect(OPCIONES_DE_TRABAJO_DE_CORREO.removeOnFail).toBe(true);
  });
});

describe('ConsumidorDeCorreo', () => {
  it('entrega un trabajo válido por el puerto', async () => {
    const correo = new CorreoEnMemoria();
    await consumidor(correo).atender(sellarCorreo(mensaje, CLAVE, 'j1'), 'j1');
    expect(correo.enviados).toEqual([mensaje]);
  });

  it('rechaza un trabajo malformado (Redis no es de fiar)', async () => {
    const correo = new CorreoEnMemoria();
    await expect(
      consumidor(correo).atender(
        sellarCorreo({ para: 'no-es-correo', asunto: 'x', texto: 'y' }, CLAVE, 'j2'),
        'j2',
      ),
    ).rejects.toThrow();
    expect(correo.enviados).toHaveLength(0);
  });

  it('si el envío falla, el error NO lleva el mensaje original (puede traer la dirección)', async () => {
    class Falla extends PuertoCorreo {
      async enviar(): Promise<void> {
        throw new Error('550 buzón a@b.test rechazado: Cuerpo secreto 123456');
      }
    }
    const error = await consumidor(new Falla())
      .atender(sellarCorreo(mensaje, CLAVE, 'j3'), 'j3')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('a@b.test');
    expect((error as Error).message).not.toContain('123456');
  });
});
