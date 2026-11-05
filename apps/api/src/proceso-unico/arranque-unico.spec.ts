/**
 * La prueba de arranque del modo `unico` (ADR-0019): el contexto del trabajador se compone y
 * arranca SIN `REDIS_URL`, con las colas en proceso, y el arranque estricto se niega si el modo
 * falta o es otro.
 *
 * La base se sustituye por una de mentira (`vi.mock` de `PrismaWebhookService`): lo que se
 * comprueba es la composición y el flujo en memoria, no PostgreSQL. La prueba contra una base
 * real vive en `proceso-unico.e2e-spec.ts` y solo corre en CI.
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const consultas: string[] = [];

vi.mock('../shared/prisma/prisma-webhook.service.js', () => {
  class PrismaWebhookService {
    tenant = { findMany: (): Promise<unknown[]> => Promise.resolve([]) };
    onModuleInit(): void {}
    onModuleDestroy(): void {}
    $queryRaw(plantilla: TemplateStringsArray): Promise<unknown[]> {
      const sql = plantilla.join('?');
      consultas.push(sql);
      return Promise.resolve(sql.includes('pg_try_advisory_xact_lock') ? [{ ok: true }] : []);
    }
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(this);
    }
  }
  return { PrismaWebhookService };
});

const { arrancarUnico, ModoEquivocadoError } = await import('./arrancar-unico.js');
const { TrabajadorUnicoModule } = await import('./proceso-unico.module.js');
const { crearCompartidoDelInbox } =
  await import('../modules/inbox/infrastructure/compartido-en-proceso.js');
const { ProcesarChange } = await import('../modules/inbox/application/procesar-change.js');
const { PuertoColaDeEnvios, PuertoReservaDeEnvio } =
  await import('../modules/inbox/application/puertos-de-envio.js');
const { PuertoCoordinacionDelBarrido } =
  await import('../modules/inbox/application/puertos-de-barrido.js');
const { PuertoPublicadorDeEventos, PuertoAvisoDeOutbox } =
  await import('../modules/inbox/application/puertos-de-eventos.js');
const { BarridoEnProceso } = await import('../modules/inbox/infrastructure/barrido.en-proceso.js');
const { ColaDeEnviosPostgres } =
  await import('../modules/inbox/infrastructure/cola-de-envios.postgres.js');
const { ReservaDeEnvioPostgres } =
  await import('../modules/inbox/infrastructure/reserva-de-envio.postgres.js');
const { ModoDeDespliegueInvalidoError } =
  await import('../shared/despliegue/modo-de-despliegue.js');

const ENTORNO_PROPIO = [
  'MODO_DESPLIEGUE',
  'REDIS_URL',
  'DATABASE_WEBHOOK_URL',
  'BARRIDO_INTERVALO_MS',
] as const;

describe('arranque del modo unico', () => {
  const guardado: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENTORNO_PROPIO) guardado[k] = process.env[k];
    consultas.length = 0;
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    for (const k of ENTORNO_PROPIO) {
      if (guardado[k] === undefined) delete process.env[k];
      else process.env[k] = guardado[k];
    }
    vi.restoreAllMocks();
  });

  it('el trabajador arranca SIN REDIS_URL, con colas en proceso, y recupera al arrancar', async () => {
    process.env['MODO_DESPLIEGUE'] = 'unico';
    delete process.env['REDIS_URL'];
    const compartido = crearCompartidoDelInbox();

    const ctx = await NestFactory.createApplicationContext(
      TrabajadorUnicoModule.forRoot(compartido),
      { logger: false },
    );
    try {
      // Los puertos son los de memoria, no los de BullMQ.
      expect(ctx.get(PuertoCoordinacionDelBarrido)).toBeInstanceOf(BarridoEnProceso);
      expect(ctx.get(PuertoColaDeEnvios)).toBeInstanceOf(ColaDeEnviosPostgres);
      expect(ctx.get(PuertoReservaDeEnvio)).toBeInstanceOf(ReservaDeEnvioPostgres);
      // El bus y los avisos son EXACTAMENTE los compartidos con la API.
      expect(ctx.get(PuertoPublicadorDeEventos)).toBe(compartido.bus);
      expect(ctx.get(PuertoAvisoDeOutbox)).toBe(compartido.avisos);

      // Barrido de recuperación al arrancar: tomó el candado de transacción y listó pendientes.
      await vi.waitFor(() =>
        expect(consultas.some((c) => c.includes('listar_changes_pendientes'))).toBe(true),
      );
      expect(consultas.some((c) => c.includes('pg_try_advisory_xact_lock'))).toBe(true);

      // El webhook (API) encola y el contexto del trabajador procesa, en el momento.
      const procesar = ctx.get(ProcesarChange);
      const ejecutar = vi
        .spyOn(procesar, 'ejecutar')
        .mockResolvedValue({ estado: 'NO_ENCONTRADO' });
      await compartido.colaDeChanges.encolar(Buffer.alloc(32, 7), 0);
      await vi.waitFor(() => expect(ejecutar).toHaveBeenCalledTimes(1));
    } finally {
      await ctx.close();
    }
  });

  it('sin MODO_DESPLIEGUE no arranca: no hay respaldo', async () => {
    delete process.env['MODO_DESPLIEGUE'];
    await expect(arrancarUnico()).rejects.toBeInstanceOf(ModoDeDespliegueInvalidoError);
  });

  it('con un valor inválido no arranca', async () => {
    await expect(arrancarUnico({ MODO_DESPLIEGUE: 'todo' })).rejects.toBeInstanceOf(
      ModoDeDespliegueInvalidoError,
    );
  });

  it('con escalado, main-unico se niega: ese modo es main.ts y worker.ts', async () => {
    await expect(arrancarUnico({ MODO_DESPLIEGUE: 'escalado' })).rejects.toBeInstanceOf(
      ModoEquivocadoError,
    );
  });
});
