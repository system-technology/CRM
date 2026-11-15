/**
 * El camino del saliente en modo `unico`, sin Redis: la API avisa, el relay lee el outbox y encola,
 * la cola de envíos sobre Postgres reclama la fila y `EnviarMensajeSaliente` la entrega.
 * La base es de mentira; se prueba la COMPOSICIÓN (quién escucha a quién).
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
      if (sql.includes('pg_try_advisory_xact_lock')) return Promise.resolve([{ ok: true }]);
      if (sql.includes('WITH candidato')) return Promise.resolve([{ intentos: 1 }]);
      return Promise.resolve([]);
    }
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(this);
    }
    $executeRaw(): Promise<number> {
      return Promise.resolve(0);
    }
    conTenantResuelto<T>(_t: string, fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(this);
    }
  }
  return { PrismaWebhookService };
});

const { TrabajadorUnicoModule } = await import('./proceso-unico.module.js');
const { crearCompartidoDelInbox } =
  await import('../modules/inbox/infrastructure/compartido-en-proceso.js');
const { EnviarMensajeSaliente } =
  await import('../modules/inbox/application/enviar-mensaje-saliente.js');
const { PuertoOutbox } = await import('../modules/inbox/application/puertos-de-eventos.js');
const { TIPO_MENSAJE_SALIENTE_CREADO } =
  await import('../modules/inbox/domain/evento-de-dominio.js');
const { PlanificadorDeRelay } = await import('../modules/inbox/interface/planificador-de-relay.js');

const TENANT = '01932000-0000-7000-8000-0000000000d0';
const MENSAJE = '01932000-0000-7000-8000-0000000000aa';

describe('modo unico: un saliente escrito por la API llega a EnviarMensajeSaliente', () => {
  const previo = process.env['MODO_DESPLIEGUE'];
  beforeEach(() => {
    process.env['MODO_DESPLIEGUE'] = 'unico';
    delete process.env['REDIS_URL'];
    consultas.length = 0;
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    if (previo === undefined) delete process.env['MODO_DESPLIEGUE'];
    else process.env['MODO_DESPLIEGUE'] = previo;
    vi.restoreAllMocks();
  });

  it('aviso de la API -> relay -> cola de envios -> caso de uso', async () => {
    const compartido = crearCompartidoDelInbox();
    const ctx = await NestFactory.createApplicationContext(
      TrabajadorUnicoModule.forRoot(compartido),
      { logger: false },
    );
    try {
      const enviar = ctx.get(EnviarMensajeSaliente);
      const ejecutar = vi
        .spyOn(enviar, 'ejecutar')
        .mockResolvedValue({ estado: 'ACEPTADO', wamid: 'wamid.x' });
      vi.spyOn(ctx.get(PuertoOutbox), 'publicarPendientes').mockImplementationOnce(
        async (tenantId, publicar) => {
          await publicar([
            {
              id: '1',
              tipo: TIPO_MENSAJE_SALIENTE_CREADO,
              tenantId,
              agregadoId: MENSAJE,
              payload: {},
            },
          ]);
          return 1;
        },
      );
      // Lo mismo que hace `AvisoAlRelayEnProceso` desde la API tras responder.
      compartido.avisos.avisar(TENANT);
      await ctx.get(PlanificadorDeRelay).tickDeAvisos();

      await vi.waitFor(() => expect(ejecutar).toHaveBeenCalledWith(TENANT, MENSAJE, false));
    } finally {
      await ctx.close();
    }
  });
});
