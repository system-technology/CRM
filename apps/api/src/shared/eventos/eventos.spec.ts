/**
 * El despacho de eventos de dominio sin base de datos: el código del error que se guarda, el
 * registro de consumidores, el intervalo y los avisos. Que la entrega sea idempotente y aislada por
 * agencia contra PostgreSQL con RLS lo prueba `booking-apertura.e2e-spec.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@viajapro/domain';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumidorDeEventos } from './consumidor-de-eventos.js';
import {
  codigoDeError,
  codigoEfectivo,
  DespachadorDeConsumidor,
  esErrorTransitorio,
  rotar,
} from './despachador-de-consumidor.js';
import {
  barridoDeDespachoActivo,
  intervaloDeDespacho,
  PlanificadorDeDespacho,
} from './planificador-de-despacho.js';
import { RegistroDeConsumidores } from './registro-de-consumidores.js';

const consumidor = (nombre: string, tipoEvento = 'quoting.cotizacion_aceptada') =>
  ({ nombre, tipoEvento, consumir: () => Promise.resolve() }) satisfies ConsumidorDeEventos;

describe('codigoDeError (lo único que se guarda en ultimo_error)', () => {
  it('un DomainError aporta su código estable, nunca el mensaje', () => {
    class Mio extends DomainError {
      readonly code = 'ALGO_PASO';
      constructor() {
        super('contiene el nombre Juan Pérez');
      }
    }
    expect(codigoDeError(new Mio())).toBe('ALGO_PASO');
  });

  it('un error sin código aporta el nombre de su clase', () => {
    expect(codigoDeError(new TypeError('x'))).toBe('TypeError');
  });

  it('un código con caracteres fuera del CHECK se sanea y se acota a 200', () => {
    const e = Object.assign(new Error('x'), { code: 'con espacios ñ y /' + 'a'.repeat(300) });
    const c = codigoDeError(e);
    expect(c).toMatch(/^[A-Za-z0-9_.:-]+$/);
    expect(c.length).toBeLessThanOrEqual(200);
  });

  it('algo que no es un error no rompe', () => {
    expect(codigoDeError('texto')).toBe('ERROR_DESCONOCIDO');
    expect(codigoDeError(null)).toBe('ERROR_DESCONOCIDO');
  });
});

describe('RegistroDeConsumidores', () => {
  it('registra y devuelve los consumidores', () => {
    const r = new RegistroDeConsumidores();
    r.registrar(consumidor('booking.abrir_archivo'));
    r.registrar(consumidor('crm.ganar_oportunidad'));
    expect(r.todos().map((c) => c.nombre)).toEqual([
      'booking.abrir_archivo',
      'crm.ganar_oportunidad',
    ]);
  });

  it('rechaza un nombre duplicado', () => {
    const r = new RegistroDeConsumidores();
    r.registrar(consumidor('booking.abrir_archivo'));
    expect(() => r.registrar(consumidor('booking.abrir_archivo'))).toThrow(/ya está registrado/);
  });

  it.each(['Booking.abrir', 'booking', 'booking.abrir-archivo', 'booking.abrir_archivo.x'])(
    'rechaza el nombre «%s» (no cumple el CHECK de la base)',
    (nombre) => {
      expect(() => new RegistroDeConsumidores().registrar(consumidor(nombre))).toThrow(/forma/);
    },
  );

  it('rechaza un tipo de evento mal formado', () => {
    expect(() =>
      new RegistroDeConsumidores().registrar(consumidor('booking.abrir_archivo', 'sin-punto')),
    ).toThrow(/forma/);
  });
});

describe('intervaloDeDespacho', () => {
  it('sin variable: 60 minutos', () => {
    expect(intervaloDeDespacho({})).toBe(3_600_000);
    expect(intervaloDeDespacho({ DESPACHO_INTERVALO_MS: '' })).toBe(3_600_000);
  });
  it('un entero válido se respeta', () => {
    expect(intervaloDeDespacho({ DESPACHO_INTERVALO_MS: '5000' })).toBe(5000);
  });
  it.each(['abc', '10', '1.5', '-5'])('«%s» no es válido: no arranca', (v) => {
    expect(() => intervaloDeDespacho({ DESPACHO_INTERVALO_MS: v })).toThrow(/no es válido/);
  });
});

describe('barridoDeDespachoActivo', () => {
  it('sin variable: activo', () => {
    expect(barridoDeDespachoActivo({})).toBe(true);
    expect(barridoDeDespachoActivo({ DESPACHO_BARRIDO: '' })).toBe(true);
  });
  it('«inerte» lo apaga', () => {
    expect(barridoDeDespachoActivo({ DESPACHO_BARRIDO: 'inerte' })).toBe(false);
  });
  it('otro valor no arranca', () => {
    expect(() => barridoDeDespachoActivo({ DESPACHO_BARRIDO: 'apagado' })).toThrow(/no es válido/);
  });
});

describe('PlanificadorDeDespacho', () => {
  it('sin consumidores registrados no programa nada y avisar es inocuo', async () => {
    const p = new PlanificadorDeDespacho({} as PrismaService, new RegistroDeConsumidores());
    p.onApplicationBootstrap();
    expect(() => p.avisar('11111111-1111-4111-8111-111111111111')).not.toThrow();
    await p.detener();
  });

  it('tras detener, los avisos se ignoran', async () => {
    const registro = new RegistroDeConsumidores();
    registro.registrar(consumidor('booking.abrir_archivo'));
    let consultas = 0;
    const prisma = {
      $queryRaw: () => {
        consultas += 1;
        return Promise.resolve([]);
      },
    } as unknown as PrismaService;
    const p = new PlanificadorDeDespacho(prisma, registro);
    p.onApplicationBootstrap();
    await p.detener();
    const antes = consultas;
    p.avisar('11111111-1111-4111-8111-111111111111');
    await p.detener();
    expect(consultas).toBe(antes);
  });
});

const conCodigo = (code: string, meta?: Record<string, unknown>) =>
  Object.assign(new Error('mensaje con datos'), { code, ...(meta ? { meta } : {}) });

describe('esErrorTransitorio (no cuenta como intento)', () => {
  it.each(['P1001', 'P1017', 'P2028', 'P2034'])('Prisma %s es transitorio', (c) => {
    expect(esErrorTransitorio(conCodigo(c))).toBe(true);
  });

  it.each(['40001', '40P01', '55P03'])('SQLSTATE %s en meta.code de P2010 es transitorio', (c) => {
    const e = conCodigo('P2010', { code: c });
    expect(esErrorTransitorio(e)).toBe(true);
    expect(codigoEfectivo(e)).toBe(c);
  });

  it('un lock timeout que solo llega en el texto es transitorio', () => {
    expect(esErrorTransitorio(new Error('canceling statement due to lock timeout'))).toBe(true);
    expect(esErrorTransitorio(new Error('ERROR: deadlock detected'))).toBe(true);
  });

  it('un error del evento o del dominio no lo es', () => {
    expect(esErrorTransitorio(conCodigo('P2002'))).toBe(false);
    expect(esErrorTransitorio(conCodigo('P2010', { code: '23505' }))).toBe(false);
    expect(esErrorTransitorio(new TypeError('x'))).toBe(false);
    expect(esErrorTransitorio(null)).toBe(false);
  });
});

describe('DespachadorDeConsumidor: fallos y abandono', () => {
  const montar = (filas: Array<{ intentos: number; abandonada: boolean }>) => {
    const consultas = vi.fn(() => Promise.resolve(filas));
    const prisma = {
      conTenant: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: consultas }),
    } as unknown as PrismaService;
    const d = new DespachadorDeConsumidor(prisma, consumidor('booking.abrir_archivo'));
    const log = (d as unknown as { log: { warn: unknown; error: unknown } }).log;
    const warn = vi.fn();
    const error = vi.fn();
    log.warn = warn;
    log.error = error;
    const fallo = (e: unknown): Promise<void> =>
      (
        d as unknown as {
          registrarFallo: (t: string, o: bigint, e: unknown) => Promise<void>;
        }
      ).registrarFallo('11111111-1111-4111-8111-111111111111', 7n, e);
    return { consultas, warn, error, fallo };
  };

  it('un error transitorio no toca la base (no suma intento) y deja el código en el log', async () => {
    const { consultas, warn, error, fallo } = montar([]);
    await fallo(conCodigo('P2010', { code: '55P03' }));
    expect(consultas).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('55P03'));
    expect(error).not.toHaveBeenCalled();
  });

  it('un error del evento suma intento', async () => {
    const { consultas, warn, fallo } = montar([{ intentos: 2, abandonada: false }]);
    await fallo(conCodigo('P2002'));
    expect(consultas).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('al abandonar escribe un log de error estructurado, solo con códigos e ids', async () => {
    const { error, fallo } = montar([{ intentos: 10, abandonada: true }]);
    await fallo(conCodigo('P2002'));
    expect(error).toHaveBeenCalledTimes(1);
    const linea = (error.mock.calls[0] as unknown as [string])[0];
    expect(JSON.parse(linea)).toEqual({
      evento: 'entrega_abandonada',
      consumidor: 'booking.abrir_archivo',
      tenantId: '11111111-1111-4111-8111-111111111111',
      outboxId: '7',
      intentos: 10,
      codigo: 'P2002',
    });
    expect(linea).not.toContain('mensaje con datos');
  });
});

describe('rotación del recorrido de agencias', () => {
  it('rotar no pierde ni repite elementos', () => {
    expect(rotar(['a', 'b', 'c', 'd'], 0)).toEqual(['a', 'b', 'c', 'd']);
    expect(rotar(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd', 'a', 'b']);
    expect(rotar(['a', 'b', 'c', 'd'], 6)).toEqual(['c', 'd', 'a', 'b']);
    expect(rotar([], 3)).toEqual([]);
  });

  it('cada pasada de barrer empieza por una agencia distinta', async () => {
    const ids = ['t1', 't2', 't3'];
    const prisma = {
      $queryRaw: () => Promise.resolve(ids.map((tenant_id) => ({ tenant_id }))),
    } as unknown as PrismaService;
    const d = new DespachadorDeConsumidor(prisma, consumidor('booking.abrir_archivo'));
    const visitadas: string[][] = [];
    let actual: string[] = [];
    vi.spyOn(d, 'despacharTenant').mockImplementation((t: string) => {
      actual.push(t);
      return Promise.resolve(0);
    });
    for (let i = 0; i < 4; i++) {
      actual = [];
      await d.barrer();
      visitadas.push(actual);
    }
    expect(visitadas).toEqual([
      ['t1', 't2', 't3'],
      ['t2', 't3', 't1'],
      ['t3', 't1', 't2'],
      ['t1', 't2', 't3'],
    ]);
  });
});
