/**
 * El despacho de eventos de dominio sin base de datos: el código del error que se guarda, el
 * registro de consumidores, el intervalo y los avisos. Que la entrega sea idempotente y aislada por
 * agencia contra PostgreSQL con RLS lo prueba `booking-apertura.e2e-spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { DomainError } from '@viajapro/domain';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumidorDeEventos } from './consumidor-de-eventos.js';
import { codigoDeError } from './despachador-de-consumidor.js';
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
