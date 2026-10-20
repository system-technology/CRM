/**
 * El ritmo de la revalidación del gateway: cada 60 s, sin solaparse. El comportamiento ante una
 * sesión revocada, una baja o una agencia suspendida se prueba con sockets reales en
 * `inbox-tiempo-real.e2e-spec.ts`.
 */
import { createServer } from 'node:http';
import type { HttpAdapterHost } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type EntradaDeAcceso,
  ResolutorDeAcceso,
  type ResultadoDeAcceso,
} from '../../../shared/puertos/puerto-de-acceso.js';
import { BandejaEnVivoGateway, INTERVALO_DE_REVALIDACION_MS } from './bandeja-en-vivo.gateway.js';

class Resolutor extends ResolutorDeAcceso {
  resolver(_e: EntradaDeAcceso): Promise<ResultadoDeAcceso> {
    return Promise.resolve({ concedido: false, motivo: 'SIN_SESION', cookies: [] });
  }
}

describe('BandejaEnVivoGateway: temporizador', () => {
  let gateway: BandejaEnVivoGateway;

  beforeEach(() => {
    vi.useFakeTimers();
    const host = {
      httpAdapter: { getHttpServer: () => createServer() },
    } as unknown as HttpAdapterHost;
    gateway = new BandejaEnVivoGateway(host, new Resolutor());
  });

  afterEach(async () => {
    await gateway.onModuleDestroy();
    vi.useRealTimers();
  });

  it('el intervalo es de 60 segundos (ADR-0011)', () => {
    expect(INTERVALO_DE_REVALIDACION_MS).toBe(60_000);
  });

  it('revalida cada 60 s y no antes', () => {
    const revalidar = vi.spyOn(gateway, 'revalidarTodos').mockResolvedValue();
    gateway.onApplicationBootstrap();

    vi.advanceTimersByTime(59_999);
    expect(revalidar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(revalidar).toHaveBeenCalledTimes(3);
  });

  it('dejar de existir el gateway detiene el temporizador', async () => {
    const revalidar = vi.spyOn(gateway, 'revalidarTodos').mockResolvedValue();
    gateway.onApplicationBootstrap();
    await gateway.onModuleDestroy();
    vi.advanceTimersByTime(300_000);
    expect(revalidar).not.toHaveBeenCalled();
  });
});
