/**
 * El barrido, con la base y Redis de mentira: lo que se decide, no la infraestructura.
 */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarrerPendientes } from './barrer-pendientes.js';
import {
  type ChangePendiente,
  PuertoCoordinacionDelBarrido,
  PuertoPendientes,
  PuertoReencolador,
} from './puertos-de-barrido.js';

const CONFIG = { antiguedadMinimaS: 30, limite: 500, maxReencolados: 3 };
const id = (n: number): Buffer => Buffer.alloc(32, n);
const fila = (n: number, indice = 0): ChangePendiente => ({
  recepcionId: id(n),
  indice,
  antiguedadS: 60,
});

class PendientesFalsos extends PuertoPendientes {
  llamadas: Array<[number, number]> = [];
  constructor(public filas: ChangePendiente[]) {
    super();
  }
  listar(antiguedad: number, limite: number): Promise<ChangePendiente[]> {
    this.llamadas.push([antiguedad, limite]);
    return Promise.resolve(this.filas);
  }
}

/** Una cola con la semántica de `jobId` de BullMQ: un identificador, un trabajo. */
class ColaFalsa extends PuertoReencolador {
  trabajos = new Map<string, 'waiting' | 'failed' | 'completed'>();
  adds = 0;
  private clave = (r: Buffer, i: number): string => `${r.toString('hex')}-${i}`;
  enCola(r: Buffer, i: number): Promise<boolean> {
    return Promise.resolve(this.trabajos.get(this.clave(r, i)) === 'waiting');
  }
  async reencolar(r: Buffer, i: number): Promise<void> {
    await Promise.resolve();
    const k = this.clave(r, i);
    const estado = this.trabajos.get(k);
    if (estado === 'failed' || estado === 'completed') this.trabajos.delete(k);
    if (this.trabajos.has(k)) return; // el `add` con `jobId` repetido se descarta
    this.trabajos.set(k, 'waiting');
    this.adds += 1;
  }
}

class CoordinacionFalsa extends PuertoCoordinacionDelBarrido {
  cuentas = new Map<string, number>();
  turnoTomado = false;
  adquirirTurno(): Promise<boolean> {
    if (this.turnoTomado) return Promise.resolve(false);
    this.turnoTomado = true;
    return Promise.resolve(true);
  }
  contarReencolado(r: Buffer, i: number): Promise<number> {
    const k = `${r.toString('hex')}-${i}`;
    const n = (this.cuentas.get(k) ?? 0) + 1;
    this.cuentas.set(k, n);
    return Promise.resolve(n);
  }
}

describe('BarrerPendientes', () => {
  let cola: ColaFalsa;
  let coord: CoordinacionFalsa;
  let escrito: string[];

  beforeEach(() => {
    cola = new ColaFalsa();
    coord = new CoordinacionFalsa();
    escrito = [];
    const guardar = (m: unknown): void => void escrito.push(String(m));
    vi.spyOn(Logger.prototype, 'log').mockImplementation(guardar);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(guardar);
  });
  afterEach(() => vi.restoreAllMocks());

  const caso = (filas: ChangePendiente[]): { caso: BarrerPendientes; base: PendientesFalsos } => {
    const base = new PendientesFalsos(filas);
    return { caso: new BarrerPendientes(base, cola, coord), base };
  };

  it('pide a la base con la antigüedad y el límite configurados', async () => {
    const { caso: c, base } = caso([]);
    await c.ejecutar(CONFIG);
    expect(base.llamadas).toEqual([[30, 500]]);
  });

  it('reencola cada change pendiente que no tiene trabajo vivo', async () => {
    const { caso: c } = caso([fila(1), fila(2, 1)]);
    const r = await c.ejecutar(CONFIG);
    expect(r).toEqual({ candidatos: 2, reencolados: 2, yaEnCola: 0, abandonados: 0 });
    expect([...cola.trabajos.keys()].sort()).toEqual(
      [`${id(1).toString('hex')}-0`, `${id(2).toString('hex')}-1`].sort(),
    );
  });

  it('un change que ya tiene trabajo vivo no se toca ni cuenta como reencolado', async () => {
    cola.trabajos.set(`${id(1).toString('hex')}-0`, 'waiting');
    const { caso: c } = caso([fila(1)]);
    const r = await c.ejecutar(CONFIG);
    expect(r).toEqual({ candidatos: 1, reencolados: 0, yaEnCola: 1, abandonados: 0 });
    expect(coord.cuentas.size).toBe(0);
    expect(cola.adds).toBe(0);
  });

  it('borra el trabajo FALLIDO con ese id antes de reencolar: si no, BullMQ descartaría el add', async () => {
    cola.trabajos.set(`${id(1).toString('hex')}-0`, 'failed');
    const { caso: c } = caso([fila(1)]);
    const r = await c.ejecutar(CONFIG);
    expect(r.reencolados).toBe(1);
    expect(cola.trabajos.get(`${id(1).toString('hex')}-0`)).toBe('waiting');
    expect(cola.adds).toBe(1);
  });

  it('también el COMPLETADO: un trabajo que terminó sin cerrar el change se reencola', async () => {
    cola.trabajos.set(`${id(1).toString('hex')}-0`, 'completed');
    const { caso: c } = caso([fila(1)]);
    expect((await c.ejecutar(CONFIG)).reencolados).toBe(1);
  });

  it('dos barridos a la vez sobre lo mismo dejan UN solo trabajo (el jobId lo impide)', async () => {
    const { caso: a } = caso([fila(1)]);
    const { caso: b } = caso([fila(1)]);
    await Promise.all([a.ejecutar(CONFIG), b.ejecutar(CONFIG)]);
    expect(cola.adds).toBe(1);
    expect(cola.trabajos.size).toBe(1);
  });

  it('un change que falla siempre se abandona tras el tope, UNA vez en el registro, sin descartarlo', async () => {
    const { caso: c } = caso([fila(1)]);
    const resultados = [];
    for (let i = 0; i < 6; i += 1) {
      // El trabajo vuelve a fallar entre barridos.
      cola.trabajos.set(`${id(1).toString('hex')}-0`, 'failed');
      resultados.push(await c.ejecutar(CONFIG));
    }
    expect(resultados.map((r) => r.reencolados)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(resultados.map((r) => r.abandonados)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(cola.adds).toBe(3);
    // Avisa una sola vez, al cruzar el tope; los barridos siguientes callan.
    expect(escrito.filter((l) => /^Change .* abandonado por/.test(l))).toHaveLength(1);
  });

  it('el tope es por change: uno abandonado no frena a los demás', async () => {
    coord.cuentas.set(`${id(1).toString('hex')}-0`, 99);
    const { caso: c } = caso([fila(1), fila(2)]);
    const r = await c.ejecutar(CONFIG);
    expect(r).toEqual({ candidatos: 2, reencolados: 1, yaEnCola: 0, abandonados: 1 });
  });

  it('el registro lleva cuentas y el prefijo del hash, nunca contenido', async () => {
    const { caso: c } = caso([fila(1)]);
    cola.trabajos.set(`${id(1).toString('hex')}-0`, 'failed');
    coord.cuentas.set(`${id(1).toString('hex')}-0`, CONFIG.maxReencolados);
    await c.ejecutar(CONFIG);
    const todo = escrito.join('\n');
    expect(todo).toMatch(/Barrido: 1 candidatos, 0 reencolados, 0 ya en cola, 1 abandonados/);
    expect(todo).toContain(id(1).toString('hex').slice(0, 12));
    expect(todo).not.toContain(id(1).toString('hex'));
  });

  it('si la base falla, el error sube: el planificador decide qué hacer con él', async () => {
    const base = new PendientesFalsos([]);
    base.listar = () => Promise.reject(new Error('base caída'));
    await expect(new BarrerPendientes(base, cola, coord).ejecutar(CONFIG)).rejects.toThrow(
      /base caída/,
    );
  });
});
