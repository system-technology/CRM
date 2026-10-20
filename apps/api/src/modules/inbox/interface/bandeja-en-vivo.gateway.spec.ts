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
import {
  BandejaEnVivoGateway,
  FALLOS_SEGUIDOS_POR_DEFECTO,
  INTERVALO_DE_REVALIDACION_MS,
  maximoDeFallosSeguidos,
} from './bandeja-en-vivo.gateway.js';

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

describe('BandejaEnVivoGateway: revalidación que no puede comprobarse', () => {
  const concedido: ResultadoDeAcceso = {
    concedido: true,
    cookies: [],
    acceso: { tenantId: 't1', usuarioId: 'u1' },
  } as unknown as ResultadoDeAcceso;

  function montar(resolver: () => Promise<ResultadoDeAcceso>) {
    class R extends ResolutorDeAcceso {
      resolver(_e: EntradaDeAcceso): Promise<ResultadoDeAcceso> {
        return resolver();
      }
    }
    const host = {
      httpAdapter: { getHttpServer: () => createServer() },
    } as unknown as HttpAdapterHost;
    const gateway = new BandejaEnVivoGateway(host, new R());
    const socket = {
      data: { cookie: 'c', tenantId: 't1', usuarioId: 'u1' },
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    const io = { sockets: { sockets: new Map([['s1', socket]]) } };
    (gateway as unknown as { io: unknown }).io = io;
    return { gateway, socket };
  }

  it('base caída: sigue abierto hasta el N-ésimo fallo seguido y entonces se cierra', async () => {
    const { gateway, socket } = montar(() => Promise.reject(new Error('base caída')));
    for (let i = 1; i < FALLOS_SEGUIDOS_POR_DEFECTO; i++) {
      await gateway.revalidarTodos();
      expect(socket.disconnect).not.toHaveBeenCalled();
    }
    await gateway.revalidarTodos();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('una comprobación que sí responde reinicia la cuenta', async () => {
    let falla = true;
    const { gateway, socket } = montar(() =>
      falla ? Promise.reject(new Error('base caída')) : Promise.resolve(concedido),
    );
    await gateway.revalidarTodos();
    await gateway.revalidarTodos();
    falla = false;
    await gateway.revalidarTodos();
    falla = true;
    await gateway.revalidarTodos();
    await gateway.revalidarTodos();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('sesión inválida cierra al momento, sin esperar fallos', async () => {
    const { gateway, socket } = montar(() =>
      Promise.resolve({ concedido: false, motivo: 'SESION_REVOCADA', cookies: [] } as never),
    );
    await gateway.revalidarTodos();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('el máximo se configura por variable; un valor inválido vuelve al defecto', () => {
    expect(maximoDeFallosSeguidos({ SOCKET_REVALIDACION_MAX_FALLOS: '5' })).toBe(5);
    expect(maximoDeFallosSeguidos({ SOCKET_REVALIDACION_MAX_FALLOS: '0' })).toBe(3);
    expect(maximoDeFallosSeguidos({ SOCKET_REVALIDACION_MAX_FALLOS: 'x' })).toBe(3);
    expect(maximoDeFallosSeguidos({})).toBe(3);
  });
});
