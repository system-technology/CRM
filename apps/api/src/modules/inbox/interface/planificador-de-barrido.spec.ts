import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarrerPendientes } from '../application/barrer-pendientes.js';
import { PuertoCoordinacionDelBarrido } from '../application/puertos-de-barrido.js';
import { configuracionDelBarrido } from '../domain/configuracion-del-barrido.js';
import { PlanificadorDeBarrido } from './planificador-de-barrido.js';

class Turnos extends PuertoCoordinacionDelBarrido {
  libre = true;
  adquirirTurno(): Promise<boolean> {
    const r = this.libre;
    this.libre = false;
    return Promise.resolve(r);
  }
  contarReencolado(): Promise<number> {
    return Promise.resolve(1);
  }
}

describe('PlanificadorDeBarrido', () => {
  let escrito: string[];
  beforeEach(() => {
    escrito = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation(
      (m: unknown) => void escrito.push(String(m)),
    );
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const barrer = (ejecutar: () => Promise<unknown>): BarrerPendientes =>
    ({ ejecutar }) as unknown as BarrerPendientes;

  it('dos trabajadores en el mismo intervalo: solo el que gana el turno barre', async () => {
    const turnos = new Turnos();
    const ejecutar = vi.fn(() => Promise.resolve({}));
    const a = new PlanificadorDeBarrido(barrer(ejecutar), turnos);
    const b = new PlanificadorDeBarrido(barrer(ejecutar), turnos);
    await Promise.all([a.tick(), b.tick()]);
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it('un barrido que falla no lanza, y lo registra sin el mensaje del error', async () => {
    const turnos = new Turnos();
    const error = Object.assign(new Error('Failing row contains (573001112233)'), {
      code: 'P2010',
    });
    const p = new PlanificadorDeBarrido(
      barrer(() => Promise.reject(error)),
      turnos,
    );
    await expect(p.tick()).resolves.toBeUndefined();
    expect(escrito.join('\n')).toContain('Error:P2010');
    expect(escrito.join('\n')).not.toMatch(/573001112233|Failing row/);
  });

  it('si Redis no responde al pedir el turno, tampoco lanza', async () => {
    const turnos = new Turnos();
    turnos.adquirirTurno = () => Promise.reject(new Error('ECONNREFUSED'));
    const ejecutar = vi.fn();
    const p = new PlanificadorDeBarrido(barrer(ejecutar), turnos);
    await expect(p.tick()).resolves.toBeUndefined();
    expect(ejecutar).not.toHaveBeenCalled();
  });
});

describe('configuracionDelBarrido', () => {
  it('trae defaults razonables', () => {
    expect(configuracionDelBarrido({})).toEqual({
      intervaloMs: 30_000,
      antiguedadMinimaS: 30,
      limite: 500,
      maxReencolados: 10,
    });
  });

  it('lee y valida el entorno', () => {
    expect(configuracionDelBarrido({ BARRIDO_LIMITE: '50' }).limite).toBe(50);
    expect(() => configuracionDelBarrido({ BARRIDO_LIMITE: '5000' })).toThrow(/BARRIDO_LIMITE/);
    expect(() => configuracionDelBarrido({ BARRIDO_INTERVALO_MS: 'abc' })).toThrow(/INTERVALO/);
    expect(() => configuracionDelBarrido({ BARRIDO_MAX_REENCOLADOS: '0' })).toThrow(/MAX/);
  });
});
