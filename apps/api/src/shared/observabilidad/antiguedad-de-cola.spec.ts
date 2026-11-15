import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDeMedicion } from './antiguedad-de-cola.js';

/** Redis falso: lo que el medidor escribe y lo que el lector lee, en memoria. */
const almacen = new Map<string, string>();
vi.mock('ioredis', () => ({
  Redis: class {
    on(): this {
      return this;
    }
    set(clave: string, valor: string): Promise<'OK'> {
      almacen.set(clave, valor);
      return Promise.resolve('OK');
    }
    get(clave: string): Promise<string | null> {
      return Promise.resolve(almacen.get(clave) ?? null);
    }
    disconnect(): void {}
  },
}));

const {
  CLAVE_DE_COLA,
  CLAVE_DE_COLA_DE_SALIDA,
  LectorDeColaRedis,
  MedidorDeCola,
  estadoDeCola,
  umbralDeColaMin,
} = await import('./antiguedad-de-cola.js');

describe('estadoDeCola', () => {
  it('cola vacia o reciente: ok', () => {
    expect(estadoDeCola(0, 0, 5)).toEqual({ estado: 'ok', masViejaS: 0, pendientes: 0 });
    expect(estadoDeCola(300, 2, 5).estado).toBe('ok');
  });
  it('mas vieja que el umbral: atascada', () => {
    expect(estadoDeCola(301, 7, 5)).toEqual({
      estado: 'atascada',
      masViejaS: 301,
      pendientes: 7,
      umbralMin: 5,
    });
  });
  it('el umbral viene de COLA_ALERTA_MIN y tolera basura', () => {
    expect(umbralDeColaMin({ COLA_ALERTA_MIN: '10' })).toBe(10);
    expect(umbralDeColaMin({ COLA_ALERTA_MIN: 'x' })).toBe(5);
    expect(umbralDeColaMin({})).toBe(5);
  });
});

describe('MedidorDeCola y LectorDeColaRedis (T-223: entrada y salida)', () => {
  /** Responde según la función que consulte la sentencia. */
  const prismaCon = (respuestas: { entrada: unknown; salida: unknown }) => {
    const $queryRaw = vi.fn((consulta: TemplateStringsArray) => {
      const sql = consulta.join('?');
      const r = sql.includes('medir_cola_de_salida') ? respuestas.salida : respuestas.entrada;
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    });
    return { $queryRaw, cliente: { $queryRaw } as unknown as ClienteDeMedicion };
  };

  beforeEach(() => almacen.clear());

  it('publica las dos colas y la API las lee por separado', async () => {
    const prisma = prismaCon({
      entrada: [{ antiguedad_s: 12 }, { antiguedad_s: 40 }],
      salida: [{ mas_vieja_s: 900, pendientes: 3 }],
    });
    await new MedidorDeCola('redis://x', prisma.cliente).medir();

    const lector = new LectorDeColaRedis('redis://x', 5);
    expect(await lector.leer()).toEqual({ estado: 'ok', masViejaS: 40, pendientes: 2 });
    expect(await lector.leerSalida()).toEqual({
      estado: 'atascada',
      masViejaS: 900,
      pendientes: 3,
      umbralMin: 5,
    });
    // La de salida se mide con la función de la migración, sin argumentos ni nada por agencia.
    const sentencias = prisma.$queryRaw.mock.calls.map((c) => c[0].join('?'));
    expect(sentencias.some((s) => s.includes('public.medir_cola_de_salida()'))).toBe(true);
  });

  it('si la de salida falla (p. ej. sin la migración), la de entrada se publica igual', async () => {
    const avisos: string[] = [];
    const prisma = prismaCon({
      entrada: [{ antiguedad_s: 5 }],
      salida: new Error('function public.medir_cola_de_salida() does not exist'),
    });
    await new MedidorDeCola('redis://x', prisma.cliente, (m) => avisos.push(m)).medir();

    expect(almacen.has(CLAVE_DE_COLA)).toBe(true);
    expect(almacen.has(CLAVE_DE_COLA_DE_SALIDA)).toBe(false);
    const lector = new LectorDeColaRedis('redis://x', 5);
    expect(await lector.leerSalida()).toEqual({ estado: 'sin_verificar' });
    // Solo el hecho, nunca el mensaje del error.
    expect(avisos).toEqual(['No se pudo medir la antigüedad de la cola de salida; se reintenta.']);
  });

  it('y al revés: la de salida no depende de la de entrada', async () => {
    const prisma = prismaCon({
      entrada: new Error('caida'),
      salida: [{ mas_vieja_s: 0, pendientes: 0 }],
    });
    await new MedidorDeCola('redis://x', prisma.cliente).medir();

    const lector = new LectorDeColaRedis('redis://x', 5);
    expect(await lector.leer()).toEqual({ estado: 'sin_verificar' });
    expect(await lector.leerSalida()).toEqual({ estado: 'ok', masViejaS: 0, pendientes: 0 });
  });

  it('una medida con forma inesperada se lee como sin_verificar', async () => {
    almacen.set(CLAVE_DE_COLA_DE_SALIDA, JSON.stringify({ masViejaS: '9', pendientes: 1 }));
    expect(await new LectorDeColaRedis('redis://x', 5).leerSalida()).toEqual({
      estado: 'sin_verificar',
    });
  });
});
