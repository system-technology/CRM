import { describe, expect, it } from 'vitest';
import {
  ActualizarReserva,
  CancelarArchivo,
  ListarArchivos,
  ReemplazarPasajeros,
  ReservaDelArchivo,
} from './archivos.js';

const reservaSinNeto = {
  id: '01932000-0000-7000-8000-000000000001',
  mayoristaId: null,
  mayoristaNombre: null,
  moneda: 'COP',
  localizador: null,
  estado: 'PENDIENTE',
  solicitadaEn: null,
  confirmadaEn: null,
  abonadaEn: null,
  pagadaEn: null,
  timeLimit: null,
  pagoTotalVenceEn: null,
  motivoCaida: null,
  nota: null,
  plazoVigente: null,
  semaforo: null,
};

describe('contrato del archivo de viaje (ADR-0024 §3.7, T-248)', () => {
  it('la reserva sin neto es válida y la clave sigue ausente tras parsear', () => {
    const r = ReservaDelArchivo.parse(reservaSinNeto);
    expect('netoUnidades' in r).toBe(false);
  });

  it('con neto: entero en texto, o null si es desconocido; nunca un número ni un decimal', () => {
    expect(
      ReservaDelArchivo.parse({ ...reservaSinNeto, netoUnidades: '1800000' }).netoUnidades,
    ).toBe('1800000');
    expect(
      ReservaDelArchivo.parse({ ...reservaSinNeto, netoUnidades: null }).netoUnidades,
    ).toBeNull();
    expect(ReservaDelArchivo.safeParse({ ...reservaSinNeto, netoUnidades: 1800000 }).success).toBe(
      false,
    );
    expect(ReservaDelArchivo.safeParse({ ...reservaSinNeto, netoUnidades: '18.5' }).success).toBe(
      false,
    );
  });

  it('ActualizarReserva: estado obligatorio y de la lista; ausente y null son cosas distintas', () => {
    expect(ActualizarReserva.safeParse({}).success).toBe(false);
    expect(ActualizarReserva.safeParse({ estado: 'LIBERADA' }).success).toBe(false);
    expect('nota' in ActualizarReserva.parse({ estado: 'SOLICITADA' })).toBe(false);
    expect(ActualizarReserva.parse({ estado: 'SOLICITADA', nota: null }).nota).toBeNull();
  });

  it('ActualizarReserva rechaza claves desconocidas (no se cuela un neto ni un tenant)', () => {
    expect(ActualizarReserva.safeParse({ estado: 'SOLICITADA', netoUnidades: '1' }).success).toBe(
      false,
    );
    expect(ActualizarReserva.safeParse({ estado: 'SOLICITADA', tenantId: 'x' }).success).toBe(
      false,
    );
  });

  it('CancelarArchivo: OTRO exige nota', () => {
    expect(CancelarArchivo.safeParse({ motivo: 'OTRO' }).success).toBe(false);
    expect(CancelarArchivo.safeParse({ motivo: 'OTRO', nota: '  ' }).success).toBe(false);
    expect(CancelarArchivo.parse({ motivo: 'OTRO', nota: 'Cambió de planes' }).nota).toBe(
      'Cambió de planes',
    );
    expect(CancelarArchivo.parse({ motivo: 'CLIENTE_DESISTIO' }).nota).toBeNull();
  });

  it('ReemplazarPasajeros: valores por defecto y tope', () => {
    const p = ReemplazarPasajeros.parse({ pasajeros: [{ nombre: ' Ana ', tipo: 'ADT' }] })
      .pasajeros[0];
    expect(p).toEqual({ nombre: 'Ana', tipo: 'ADT', edadAlViaje: null, esTitular: false });
    const muchos = Array.from({ length: 61 }, () => ({ nombre: 'X', tipo: 'ADT' }));
    expect(ReemplazarPasajeros.safeParse({ pasajeros: muchos }).success).toBe(false);
    expect(
      ReemplazarPasajeros.safeParse({ pasajeros: [{ nombre: 'X', tipo: 'CHD', edadAlViaje: 121 }] })
        .success,
    ).toBe(false);
  });

  it('ListarArchivos coacciona el límite del query string y por defecto trae los ABIERTOS', () => {
    expect(ListarArchivos.parse({})).toEqual({ estado: 'ABIERTO', limite: 200 });
    expect(ListarArchivos.parse({ estado: 'TODOS', limite: '50' })).toEqual({
      estado: 'TODOS',
      limite: 50,
    });
    expect(ListarArchivos.safeParse({ limite: '501' }).success).toBe(false);
  });
});
