/**
 * Lo que el contexto HTTP elige en modo `unico` sin tocar la base: la cola de correo, el limitador
 * de OTP, el bus y el aviso al relay. Nada de esto necesita `REDIS_URL`.
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ENTORNO = ['MODO_DESPLIEGUE', 'REDIS_URL', 'LIMITADOR_OTP', 'COLA_CORREO'] as const;
const guardado: Record<string, string | undefined> = {};

describe('contexto HTTP en modo unico', () => {
  beforeAll(() => {
    for (const k of ENTORNO) guardado[k] = process.env[k];
    process.env['MODO_DESPLIEGUE'] = 'unico';
    delete process.env['REDIS_URL'];
    delete process.env['LIMITADOR_OTP'];
    // En pruebas se fija en memoria; en modo unico debe mandar el modo, no esta variable.
    delete process.env['COLA_CORREO'];
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => {
    for (const k of ENTORNO) {
      if (guardado[k] === undefined) delete process.env[k];
      else process.env[k] = guardado[k];
    }
    vi.restoreAllMocks();
  });

  it('el correo sale por la cola EN PROCESO, sin Redis ni trabajador', async () => {
    const { NotificationsModule } =
      await import('../modules/notifications/notifications.module.js');
    const { PuertoColaDeCorreo } = await import('../shared/puertos/puerto-de-correo.js');
    const { ColaDeCorreoEnProceso } =
      await import('../modules/notifications/infrastructure/cola-de-correo.en-proceso.js');
    const ctx = await NestFactory.createApplicationContext(NotificationsModule, { logger: false });
    try {
      expect(ctx.get(PuertoColaDeCorreo)).toBeInstanceOf(ColaDeCorreoEnProceso);
    } finally {
      await ctx.close();
    }
  });

  it('el limitador de OTP es el de memoria, sin LIMITADOR_OTP y sin Redis', async () => {
    const { crearLimitadorDeEnvios } =
      await import('../modules/identity/infrastructure/crear-limitador-de-envios.js');
    const { LimitadorDeEnviosEnMemoria } =
      await import('../modules/identity/infrastructure/limitador-de-envios.en-memoria.js');
    expect(crearLimitadorDeEnvios()).toBeInstanceOf(LimitadorDeEnviosEnMemoria);
  });

  it('el bus y el aviso al relay son los COMPARTIDOS con el trabajador', async () => {
    const { crearBusEnMemoriaSiSePide, crearAvisoAlRelay } =
      await import('../modules/inbox/infrastructure/crear-bus.js');
    const { crearCompartidoDelInbox } =
      await import('../modules/inbox/infrastructure/compartido-en-proceso.js');
    const { AvisoAlRelayEnProceso } =
      await import('../modules/inbox/infrastructure/aviso-al-relay.en-proceso.js');
    const compartido = crearCompartidoDelInbox();
    const bus = crearBusEnMemoriaSiSePide(compartido);
    expect(bus).toBe(compartido.bus);
    const aviso = crearAvisoAlRelay(bus, compartido);
    expect(aviso).toBeInstanceOf(AvisoAlRelayEnProceso);
    await aviso.avisar('11111111-1111-4111-8111-111111111111');
    expect(compartido.avisos.tomarAvisos()).toEqual(['11111111-1111-4111-8111-111111111111']);
  });
});
