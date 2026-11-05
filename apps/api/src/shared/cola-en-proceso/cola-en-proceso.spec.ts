import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColaEnProceso, type OpcionesDeColaEnProceso } from './cola-en-proceso.js';

const base = <T>(extra: Partial<OpcionesDeColaEnProceso<T>> = {}): OpcionesDeColaEnProceso<T> => ({
  concurrencia: 2,
  intentos: 3,
  esperaBaseMs: 1_000,
  ...extra,
});

describe('ColaEnProceso', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un trabajo NO hereda el AsyncLocalStorage de quien lo encola, ni en el reintento (C3)', async () => {
    const als = new AsyncLocalStorage<{ tenant: string }>();
    const vistos: Array<string | undefined> = [];
    const cola = new ColaEnProceso<string>(base({ intentos: 2 }), (_d, c) => {
      vistos.push(als.getStore()?.tenant);
      return c.intento < 2 ? Promise.reject(new Error('cae')) : Promise.resolve();
    });
    // Dos «peticiones» de agencias distintas encolan desde su propio contexto.
    als.run({ tenant: 'A' }, () => cola.encolar('a', 'x'));
    als.run({ tenant: 'B' }, () => cola.encolar('b', 'y'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vistos).toHaveLength(4);
    expect(vistos.every((v) => v === undefined)).toBe(true);
  });

  it('despacha al instante, sin esperar a ningún barrido', async () => {
    const procesar = vi.fn(() => Promise.resolve());
    const cola = new ColaEnProceso<string>(base(), procesar);
    cola.encolar('a', 'dato');
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledWith('dato', { intento: 1, ultimoIntento: false });
  });

  it('reintenta con espera exponencial y marca el último intento', async () => {
    const contextos: Array<[number, boolean]> = [];
    const procesar = vi.fn((_d: string, c: { intento: number; ultimoIntento: boolean }) => {
      contextos.push([c.intento, c.ultimoIntento]);
      return c.intento < 3 ? Promise.reject(new Error('cae')) : Promise.resolve();
    });
    const cola = new ColaEnProceso<string>(base(), procesar);
    cola.encolar('a', 'x');
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(procesar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 1 s tras el primer fallo
    expect(procesar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(procesar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // 2 s tras el segundo
    expect(contextos).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(cola.estaViva('a')).toBe(false);
  });

  it('agotados los intentos, avisa una vez y libera la clave', async () => {
    const alAgotar = vi.fn();
    const alFallar = vi.fn();
    const cola = new ColaEnProceso<string>(base<string>({ alAgotar, alFallar }), () =>
      Promise.reject(new Error('siempre')),
    );
    cola.encolar('a', 'x');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(alFallar).toHaveBeenCalledTimes(3);
    expect(alAgotar).toHaveBeenCalledTimes(1);
    expect(alAgotar.mock.calls[0]?.[0]).toBe('a');
    expect(cola.estaViva('a')).toBe(false);
    // Liberada: el barrido puede volver a darla.
    expect(cola.encolar('a', 'x')).toBe(true);
  });

  it('un error definitivo no se reintenta', async () => {
    class Definitivo extends Error {}
    const procesar = vi.fn(() => Promise.reject(new Definitivo('4xx')));
    const alAgotar = vi.fn();
    const cola = new ColaEnProceso<string>(
      base<string>({ esDefinitivo: (e) => e instanceof Definitivo, alAgotar }),
      procesar,
    );
    cola.encolar('a', 'x');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(alAgotar).toHaveBeenCalledTimes(1);
  });

  it('deduplica por clave mientras el trabajo vive (idempotencia)', async () => {
    let soltar: () => void = () => undefined;
    const procesar = vi.fn(
      () =>
        new Promise<void>((r) => {
          soltar = r;
        }),
    );
    const cola = new ColaEnProceso<string>(base(), procesar);
    expect(cola.encolar('a', 'x')).toBe(true);
    expect(cola.encolar('a', 'x')).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(cola.encolar('a', 'x')).toBe(false); // en curso
    soltar();
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('respeta el tope de concurrencia', async () => {
    const sueltas: Array<() => void> = [];
    const procesar = vi.fn(
      () =>
        new Promise<void>((r) => {
          sueltas.push(r);
        }),
    );
    const cola = new ColaEnProceso<string>(base({ concurrencia: 2 }), procesar);
    for (const k of ['a', 'b', 'c']) cola.encolar(k, k);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(2);
    sueltas[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(3);
  });

  it('lo encolado antes de conectar espera y sale al conectar', async () => {
    const cola = new ColaEnProceso<string>(base());
    cola.encolar('a', 'x');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(cola.estaViva('a')).toBe(true);
    const procesar = vi.fn(() => Promise.resolve());
    cola.conectar(procesar);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('recuerda un éxito reciente y lo olvida pasado el plazo', async () => {
    const procesar = vi.fn(() => Promise.resolve());
    const cola = new ColaEnProceso<string>(base({ recordarExitosMs: 60_000 }), procesar);
    cola.encolar('a', 'x');
    await vi.advanceTimersByTimeAsync(0);
    expect(cola.encolar('a', 'x')).toBe(false);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(cola.encolar('a', 'x')).toBe(true);
  });

  describe('cierre ordenado', () => {
    it('espera lo que está en curso, descarta reintentos y no acepta más', async () => {
      let soltar: () => void = () => undefined;
      const procesar = vi.fn((d: string) => {
        if (d === 'enCurso') {
          return new Promise<void>((r) => {
            soltar = r;
          });
        }
        return Promise.reject(new Error('falla'));
      });
      const cola = new ColaEnProceso<string>(base(), procesar);
      cola.encolar('r', 'reintento');
      cola.encolar('c', 'enCurso');
      await vi.advanceTimersByTimeAsync(0); // 'r' falló y espera su reintento; 'c' sigue en curso

      let cerrada = false;
      const cierre = cola.cerrar(60_000).then((n) => {
        cerrada = true;
        return n;
      });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(cerrada).toBe(false); // espera al trabajo en curso
      expect(procesar).toHaveBeenCalledTimes(2); // el reintento descartado no corrió
      soltar();
      expect(await cierre).toBe(1); // solo el reintento quedó sin hacer
      expect(cola.encolar('z', 'z')).toBe(false);
    });

    it('si el trabajo en curso no termina, cierra al cumplirse el plazo', async () => {
      const cola = new ColaEnProceso<string>(base(), () => new Promise<void>(() => undefined));
      cola.encolar('a', 'x');
      await vi.advanceTimersByTimeAsync(0);
      const cierre = cola.cerrar(2_000);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await cierre).toBe(1);
    });
  });

  it('rechaza opciones imposibles', () => {
    expect(() => new ColaEnProceso(base({ concurrencia: 0 }))).toThrow(RangeError);
  });
});
