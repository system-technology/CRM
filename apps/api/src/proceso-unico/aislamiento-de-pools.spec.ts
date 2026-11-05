/**
 * ADR-0019 §3.6(a)-(b): en el proceso único, el contexto HTTP NO alcanza el pool de
 * `viajapro_webhook`, y el del trabajador no alcanza los pools de la API ni el de identidad.
 * Los servicios de Prisma se simulan: se comprueba qué existe en cada contenedor de inyección.
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function falso(): unknown {
  return class {
    onModuleInit(): void {}
    onModuleDestroy(): void {}
    $queryRaw(plantilla: TemplateStringsArray): Promise<unknown[]> {
      return Promise.resolve(plantilla.join('?').includes('pg_try_advisory') ? [{ ok: true }] : []);
    }
    $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(this);
    }
    tenant = { findMany: (): Promise<unknown[]> => Promise.resolve([]) };
  };
}

vi.mock('../shared/prisma/prisma-webhook.service.js', () => ({ PrismaWebhookService: falso() }));
vi.mock('../shared/prisma/prisma.service.js', () => ({ PrismaService: falso() }));
vi.mock('../modules/identity/infrastructure/prisma-identidad.service.js', () => ({
  PrismaIdentidadService: falso(),
}));

const { ApiUnicoModule, TrabajadorUnicoModule } = await import('./proceso-unico.module.js');
const { crearCompartidoDelInbox } =
  await import('../modules/inbox/infrastructure/compartido-en-proceso.js');
const { PrismaWebhookService } = await import('../shared/prisma/prisma-webhook.service.js');
const { PrismaService } = await import('../shared/prisma/prisma.service.js');
const { PrismaIdentidadService } =
  await import('../modules/identity/infrastructure/prisma-identidad.service.js');

describe('aislamiento de pools en el proceso unico', () => {
  beforeEach(() => {
    vi.stubEnv('MODO_DESPLIEGUE', 'unico');
    vi.stubEnv('REDIS_URL', '');
    for (const nivel of ['warn', 'log', 'error'] as const) {
      vi.spyOn(Logger.prototype, nivel).mockImplementation(() => undefined);
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('el contexto HTTP NO resuelve PrismaWebhookService (R2)', async () => {
    const ctx = await NestFactory.create(ApiUnicoModule.forRoot(crearCompartidoDelInbox()), {
      logger: false,
    });
    try {
      expect(() => ctx.get(PrismaWebhookService, { strict: false })).toThrow();
      // Control: el contenedor sí tiene sus propios pools.
      expect(ctx.get(PrismaService, { strict: false })).toBeDefined();
    } finally {
      await ctx.close();
    }
  });

  it('el contexto del trabajador NO resuelve PrismaService ni PrismaIdentidadService', async () => {
    const ctx = await NestFactory.createApplicationContext(
      TrabajadorUnicoModule.forRoot(crearCompartidoDelInbox()),
      { logger: false },
    );
    try {
      expect(() => ctx.get(PrismaService, { strict: false })).toThrow();
      expect(() => ctx.get(PrismaIdentidadService, { strict: false })).toThrow();
      expect(ctx.get(PrismaWebhookService, { strict: false })).toBeDefined();
    } finally {
      await ctx.close();
    }
  });
});
