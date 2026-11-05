/**
 * Los adaptadores EN PROCESO del modo `unico` (ADR-0019), con la base de mentira: lo que deciden,
 * no la infraestructura.
 */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisosDeOutboxEnMemoria } from './avisos-de-outbox.en-memoria.js';
import { AvisoAlRelayEnProceso } from './aviso-al-relay.en-proceso.js';
import {
  BarridoEnProceso,
  type ClienteConTransacciones,
  type TransaccionConConsulta,
} from './barrido.en-proceso.js';
import { ColaDeChangesEnProceso } from './cola-de-changes.en-proceso.js';
import {
  ColaDeEnviosEnMemoriaTemporal,
  ReservaDeEnvioEnMemoriaTemporal,
} from './cola-de-envios.en-memoria-temporal.js';
import { crearCompartidoDelInbox } from './compartido-en-proceso.js';

const id = (n: number): Buffer => Buffer.alloc(32, n);

describe('ColaDeChangesEnProceso', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('despacha el change en el momento, sin barrido', async () => {
    const cola = new ColaDeChangesEnProceso();
    const procesar = vi.fn(() => Promise.resolve());
    cola.conectar(procesar);
    await cola.encolar(id(1), 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledWith(id(1), 0);
  });

  it('el mismo change dos veces (reintento de Meta) se procesa una vez mientras vive', async () => {
    const cola = new ColaDeChangesEnProceso();
    const procesar = vi.fn(() => new Promise<void>(() => undefined));
    cola.conectar(procesar);
    await cola.encolar(id(1), 0);
    await cola.encolar(id(1), 0);
    await cola.encolar(id(1), 1); // otro índice: otro change
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(2);
  });

  it('reintenta con espera exponencial desde 2 s, cinco intentos, y luego avisa', async () => {
    const alAgotar = vi.fn();
    const cola = new ColaDeChangesEnProceso({ alAgotar });
    const procesar = vi.fn(() => Promise.reject(new Error('base caída')));
    cola.conectar(procesar);
    await cola.encolar(id(2), 0);
    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 16_000);
    expect(procesar).toHaveBeenCalledTimes(5);
    expect(alAgotar).toHaveBeenCalledTimes(1);
    // El aviso lleva la clave, no el contenido.
    expect(alAgotar.mock.calls[0]?.[0]).toBe(`${id(2).toString('hex')}-0`);
    expect(cola.estaViva(id(2), 0)).toBe(false);
  });

  it('encolar nunca lanza ni espera al procesamiento (el 200 a Meta no depende de él)', async () => {
    const cola = new ColaDeChangesEnProceso();
    cola.conectar(() => Promise.reject(new Error('x')));
    await expect(cola.encolar(id(3), 0)).resolves.toBeUndefined();
  });

  it('cierre ordenado: espera lo que está en curso', async () => {
    const cola = new ColaDeChangesEnProceso();
    let soltar: () => void = () => undefined;
    cola.conectar(
      () =>
        new Promise<void>((r) => {
          soltar = r;
        }),
    );
    await cola.encolar(id(4), 0);
    await vi.advanceTimersByTimeAsync(0);
    let cerrada = false;
    const cierre = cola.cerrar().then(() => {
      cerrada = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(cerrada).toBe(false);
    soltar();
    await cierre;
    expect(cerrada).toBe(true);
  });
});

describe('BarridoEnProceso', () => {
  /** Una base de mentira cuyo candado se puede tener ocupado. */
  function baseFalsa(libre: () => boolean): {
    prisma: ClienteConTransacciones;
    consultas: string[];
    abiertas: () => number;
  } {
    const consultas: string[] = [];
    let abiertas = 0;
    const tx: TransaccionConConsulta = {
      $queryRaw: <T>(plantilla: TemplateStringsArray): Promise<T> => {
        consultas.push(plantilla.join('?'));
        return Promise.resolve([{ ok: libre() }] as unknown as T);
      },
    };
    const prisma: ClienteConTransacciones = {
      async $transaction<T>(fn: (t: TransaccionConConsulta) => Promise<T>): Promise<T> {
        abiertas += 1;
        try {
          return await fn(tx);
        } finally {
          abiertas -= 1;
        }
      },
    };
    return { prisma, consultas, abiertas: () => abiertas };
  }

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('enCola mira la cola en memoria y reencolar la rellena sin duplicar', async () => {
    const cola = new ColaDeChangesEnProceso();
    const barrido = new BarridoEnProceso(cola, baseFalsa(() => true).prisma);
    expect(await barrido.enCola(id(1), 0)).toBe(false);
    await barrido.reencolar(id(1), 0);
    expect(await barrido.enCola(id(1), 0)).toBe(true);
    await barrido.reencolar(id(1), 0); // ya viva: no duplica
    expect(cola.estaViva(id(1), 0)).toBe(true);
  });

  it('con el candado libre corre la tarea DENTRO de la transacción que lo sostiene', async () => {
    const { prisma, consultas, abiertas } = baseFalsa(() => true);
    const barrido = new BarridoEnProceso(new ColaDeChangesEnProceso(), prisma);
    let transaccionesDuranteLaTarea = 0;
    const corrio = await barrido.conTurno(60_000, () => {
      transaccionesDuranteLaTarea = abiertas();
      return Promise.resolve();
    });
    expect(corrio).toBe(true);
    expect(transaccionesDuranteLaTarea).toBe(1);
    expect(abiertas()).toBe(0);
    // Candado de TRANSACCIÓN, no de sesión: funciona a través del pooler de Neon.
    expect(consultas.join('\n')).toMatch(/pg_try_advisory_xact_lock/);
    expect(consultas.join('\n')).not.toMatch(/pg_try_advisory_lock\(/);
  });

  it('con el candado ocupado no corre la tarea', async () => {
    const { prisma } = baseFalsa(() => false);
    const barrido = new BarridoEnProceso(new ColaDeChangesEnProceso(), prisma);
    const tarea = vi.fn(() => Promise.resolve());
    expect(await barrido.conTurno(60_000, tarea)).toBe(false);
    expect(tarea).not.toHaveBeenCalled();
  });

  it('dos solapes: el segundo se encuentra el candado tomado', async () => {
    let tomado = false;
    const { prisma } = baseFalsa(() => {
      if (tomado) return false;
      tomado = true;
      return true;
    });
    const a = new BarridoEnProceso(new ColaDeChangesEnProceso(), prisma);
    const b = new BarridoEnProceso(new ColaDeChangesEnProceso(), prisma);
    const tarea = vi.fn(() => Promise.resolve());
    const r = await Promise.all([a.conTurno(1_000, tarea), b.conTurno(1_000, tarea)]);
    expect(r.sort()).toEqual([false, true]);
    expect(tarea).toHaveBeenCalledTimes(1);
  });

  it('si la tarea falla, el error sube (la transacción se deshace y el candado cae)', async () => {
    const { prisma, abiertas } = baseFalsa(() => true);
    const barrido = new BarridoEnProceso(new ColaDeChangesEnProceso(), prisma);
    await expect(barrido.conTurno(1_000, () => Promise.reject(new Error('x')))).rejects.toThrow(
      'x',
    );
    expect(abiertas()).toBe(0);
  });
});

describe('aviso al relay en proceso', () => {
  it('la pista de la API llega a los avisos que lee el relay, por tenant, sin duplicar', async () => {
    const avisos = new AvisosDeOutboxEnMemoria();
    const aviso = new AvisoAlRelayEnProceso(avisos);
    await aviso.avisar('t-1');
    await aviso.avisar('t-1');
    await aviso.avisar('t-2');
    expect(avisos.tomarAvisos().sort()).toEqual(['t-1', 't-2']);
    expect(avisos.tomarAvisos()).toEqual([]);
  });
});

describe('compartido del proceso unico', () => {
  it('crea UNA instancia de cada pieza, que se pasa a los dos contextos', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const c = crearCompartidoDelInbox();
    expect(c.bus).toBeDefined();
    expect(c.avisos).toBeDefined();
    expect(c.colaDeChanges).toBeInstanceOf(ColaDeChangesEnProceso);
    vi.restoreAllMocks();
  });
});

describe('TEMPORAL-PASO-4: envíos y reserva en memoria', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('una reserva por mensaje: la segunda se niega, y liberar la reabre', async () => {
    const reserva = new ReservaDeEnvioEnMemoriaTemporal();
    expect(await reserva.reservar('m-1')).toBe(true);
    expect(await reserva.reservar('m-1')).toBe(false);
    expect(await reserva.reservar('m-2')).toBe(true);
    await reserva.liberar('m-1');
    expect(await reserva.reservar('m-1')).toBe(true);
  });

  it('el mismo mensaje encolado dos veces se envía una vez (R5)', async () => {
    const cola = new ColaDeEnviosEnMemoriaTemporal();
    const enviar = vi.fn(() => new Promise<void>(() => undefined));
    cola.conectar(enviar);
    await cola.encolar('t-1', 'm-1');
    await cola.encolar('t-1', 'm-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]).toEqual(['t-1', 'm-1', { intento: 1, ultimoIntento: false }]);
  });

  it('reintenta seis veces desde 3 s y el último intento llega marcado', async () => {
    const cola = new ColaDeEnviosEnMemoriaTemporal();
    const ultimos: boolean[] = [];
    cola.conectar((_t, _m, c) => {
      ultimos.push(c.ultimoIntento);
      return Promise.reject(new Error('Meta caído'));
    });
    await cola.encolar('t-1', 'm-1');
    await vi.advanceTimersByTimeAsync(3_000 + 6_000 + 12_000 + 24_000 + 48_000);
    expect(ultimos).toEqual([false, false, false, false, false, true]);
  });

  it('cierre ordenado', async () => {
    const cola = new ColaDeEnviosEnMemoriaTemporal();
    cola.conectar(() => Promise.resolve());
    await expect(cola.cerrar()).resolves.toBe(0);
    await cola.encolar('t-1', 'm-9'); // cerrada: no entra
    await vi.advanceTimersByTimeAsync(0);
  });
});
