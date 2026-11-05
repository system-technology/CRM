import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarrerPendientes } from '../application/barrer-pendientes.js';
import { PuertoCoordinacionDelBarrido } from '../application/puertos-de-barrido.js';
import type { RelevarOutbox } from '../application/relevar-outbox.js';
import { AvisosDeOutboxEnMemoria } from '../infrastructure/avisos-de-outbox.en-memoria.js';
import { PlanificadorDeRelay } from './planificador-de-relay.js';
import { PlanificadorDeSeguridad } from './planificador-de-seguridad.js';

class Turnos extends PuertoCoordinacionDelBarrido {
  libre = true;
  async conTurno(_ms: number, tarea: () => Promise<void>): Promise<boolean> {
    if (!this.libre) return false;
    await tarea();
    return true;
  }
}

describe('PlanificadorDeSeguridad (modo unico)', () => {
  let escrito: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    escrito = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation(
      (m: unknown) => void escrito.push(String(m)),
    );
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    delete process.env['BARRIDO_INTERVALO_MS'];
    delete process.env['BARRIDO_ANTIGUEDAD_S'];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env['BARRIDO_INTERVALO_MS'];
  });

  function armar(opciones: { turnos?: Turnos } = {}): {
    p: PlanificadorDeSeguridad;
    changes: ReturnType<typeof vi.fn>;
    outbox: ReturnType<typeof vi.fn>;
  } {
    const changes = vi.fn(() => Promise.resolve({}));
    const outbox = vi.fn(() => Promise.resolve(0));
    const p = new PlanificadorDeSeguridad(
      { ejecutar: changes } as unknown as BarrerPendientes,
      opciones.turnos ?? new Turnos(),
      { barrer: outbox } as unknown as RelevarOutbox,
    );
    return { p, changes, outbox };
  }

  it('barre al arrancar SIN antigüedad mínima: lo recibido antes del reinicio no espera una hora', async () => {
    const { p, changes, outbox } = armar();
    p.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toHaveBeenCalledTimes(1);
    expect((changes.mock.calls[0] as unknown[])[0]).toMatchObject({ antiguedadMinimaS: 0 });
    expect(outbox).toHaveBeenCalledTimes(1);
    await p.onModuleDestroy();
  });

  it('después barre cada 60 minutos por defecto, con la antigüedad normal', async () => {
    const { p, changes, outbox } = armar();
    p.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(changes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(changes).toHaveBeenCalledTimes(2);
    expect(outbox).toHaveBeenCalledTimes(2);
    expect((changes.mock.calls[1] as unknown[])[0]).toMatchObject({ antiguedadMinimaS: 30 });
    await p.onModuleDestroy();
  });

  it('el intervalo se configura con BARRIDO_INTERVALO_MS', async () => {
    process.env['BARRIDO_INTERVALO_MS'] = '120000';
    const { p, changes } = armar();
    p.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(changes).toHaveBeenCalledTimes(2);
    await p.onModuleDestroy();
  });

  it('con el turno ocupado no barre changes, pero el outbox sí (SKIP LOCKED lo protege)', async () => {
    const turnos = new Turnos();
    turnos.libre = false;
    const { p, changes, outbox } = armar({ turnos });
    await p.pasada('periodica');
    expect(changes).not.toHaveBeenCalled();
    expect(outbox).toHaveBeenCalledTimes(1);
  });

  it('un fallo de changes no impide barrer el outbox, y se registra sin el mensaje (R10)', async () => {
    const { p, changes, outbox } = armar();
    changes.mockRejectedValue(
      Object.assign(new Error('Failing row contains (573001112233)'), { code: 'P2010' }),
    );
    await expect(p.pasada('periodica')).resolves.toBeUndefined();
    expect(outbox).toHaveBeenCalledTimes(1);
    expect(escrito.join('\n')).toContain('Error:P2010');
    expect(escrito.join('\n')).not.toMatch(/573001112233|Failing row/);
  });

  it('un fallo del outbox no lanza', async () => {
    const { p, outbox } = armar();
    outbox.mockRejectedValue(new Error('x'));
    await expect(p.pasada('periodica')).resolves.toBeUndefined();
  });

  it('no apila pasadas: si hay una en curso, devuelve la misma', async () => {
    const { p, changes } = armar();
    let soltar: () => void = () => undefined;
    changes.mockImplementation(
      () =>
        new Promise((r) => {
          soltar = () => r({});
        }),
    );
    const a = p.pasada('periodica');
    const b = p.pasada('periodica');
    expect(a).toBe(b);
    soltar();
    await a;
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('al cerrar deja de barrer', async () => {
    const { p, changes } = armar();
    p.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await p.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(changes).toHaveBeenCalledTimes(1);
  });
});

describe('PlanificadorDeRelay en modo unico', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sin barrido propio: no toca la base cada 15 s, solo atiende avisos en memoria', async () => {
    const barrer = vi.fn(() => Promise.resolve(0));
    const vaciar = vi.fn(() => Promise.resolve(0));
    const avisos = new AvisosDeOutboxEnMemoria();
    const relay = new PlanificadorDeRelay({ barrer, vaciar } as unknown as RelevarOutbox, avisos, {
      barridoMs: 0,
    });
    relay.onModuleInit();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(barrer).not.toHaveBeenCalled();
    expect(vaciar).not.toHaveBeenCalled();

    avisos.avisar('11111111-1111-4111-8111-111111111111');
    await vi.advanceTimersByTimeAsync(500);
    expect(vaciar).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    relay.onModuleDestroy();
  });

  it('sin opciones conserva el barrido de 15 s (modo escalado)', async () => {
    const barrer = vi.fn(() => Promise.resolve(0));
    const relay = new PlanificadorDeRelay(
      { barrer } as unknown as RelevarOutbox,
      new AvisosDeOutboxEnMemoria(),
    );
    relay.onModuleInit();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(barrer).toHaveBeenCalledTimes(1);
    relay.onModuleDestroy();
  });
});
