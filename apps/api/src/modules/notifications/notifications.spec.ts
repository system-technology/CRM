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
import { ConsumidorDeCorreo } from './interface/consumidor-de-correo.js';

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
      expect(() => crearCorreo({ MAIL_PROVIDER: p, APP_ENV: 'local' })).toThrow(/ADR/);
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

describe('ConsumidorDeCorreo', () => {
  it('entrega un trabajo válido por el puerto', async () => {
    const correo = new CorreoEnMemoria();
    await new ConsumidorDeCorreo(correo).atender(mensaje);
    expect(correo.enviados).toEqual([mensaje]);
  });

  it('rechaza un trabajo malformado (Redis no es de fiar)', async () => {
    const correo = new CorreoEnMemoria();
    await expect(
      new ConsumidorDeCorreo(correo).atender({ para: 'no-es-correo', asunto: 'x', texto: 'y' }),
    ).rejects.toThrow();
    expect(correo.enviados).toHaveLength(0);
  });

  it('si el envío falla, el error NO lleva el mensaje original (puede traer la dirección)', async () => {
    class Falla extends PuertoCorreo {
      async enviar(): Promise<void> {
        throw new Error('550 buzón a@b.test rechazado: Cuerpo secreto 123456');
      }
    }
    const error = await new ConsumidorDeCorreo(new Falla()).atender(mensaje).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('a@b.test');
    expect((error as Error).message).not.toContain('123456');
  });
});
