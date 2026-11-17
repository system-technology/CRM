import { describe, expect, it } from 'vitest';
import {
  abrirArchivoDeViaje,
  type LineaVendida,
  reservasPorMayorista,
  type VentaAceptada,
} from './archivo-de-viaje.js';

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';

const linea = (
  mayoristaId: string | null,
  netoUnidades: bigint | null,
  nombre: string | null = mayoristaId === M1 ? 'Mayorista Uno' : mayoristaId === M2 ? 'Dos' : null,
): LineaVendida => ({ mayoristaId, mayoristaNombre: nombre, netoUnidades });

describe('reservasPorMayorista', () => {
  it('una reserva por mayorista distinto, en orden de primera aparición', () => {
    const r = reservasPorMayorista([linea(M2, 100n), linea(M1, 50n), linea(M2, 30n)], 'COP');
    expect(r.map((x) => x.mayoristaId)).toEqual([M2, M1]);
    expect(r[0]).toEqual({
      mayoristaId: M2,
      mayoristaNombre: 'Dos',
      netoUnidades: 130n,
      monedaIso: 'COP',
    });
    expect(r[1]?.netoUnidades).toBe(50n);
  });

  it('las líneas sin mayorista caen juntas en una reserva «por definir», al final', () => {
    const r = reservasPorMayorista([linea(null, 10n), linea(M1, 50n), linea(null, 5n)], 'USD');
    expect(r).toHaveLength(2);
    expect(r[0]?.mayoristaId).toBe(M1);
    expect(r[1]).toEqual({
      mayoristaId: null,
      mayoristaNombre: null,
      netoUnidades: 15n,
      monedaIso: 'USD',
    });
  });

  it('el neto es desconocido (null, no una suma parcial) si alguna línea no lo trae', () => {
    const r = reservasPorMayorista([linea(M1, 50n), linea(M1, null), linea(null, null)], 'COP');
    expect(r.map((x) => x.netoUnidades)).toEqual([null, null]);
  });

  it('un neto de cero es cero, no desconocido', () => {
    expect(reservasPorMayorista([linea(M1, 0n)], 'COP')[0]?.netoUnidades).toBe(0n);
  });

  it('sin líneas: un archivo no queda sin reservas, hay una «por definir»', () => {
    expect(reservasPorMayorista([], 'COP')).toEqual([
      { mayoristaId: null, mayoristaNombre: null, netoUnidades: null, monedaIso: 'COP' },
    ]);
  });

  it('conserva el nombre del primer elemento que lo trae', () => {
    const r = reservasPorMayorista([linea(M1, 1n, null), linea(M1, 1n, 'Con nombre')], 'COP');
    expect(r[0]?.mayoristaNombre).toBe('Con nombre');
  });
});

describe('abrirArchivoDeViaje', () => {
  const venta: VentaAceptada = {
    cotizacionId: '33333333-3333-4333-8333-333333333333',
    version: 2,
    contactoId: '44444444-4444-4444-8444-444444444444',
    oportunidadId: null,
    paqueteNombre: 'Cartagena 4 noches',
    destino: 'Cartagena',
    fechaSalida: '2027-03-10',
    noches: 4,
    adultos: 2,
    ninos: 0,
    infantes: 0,
    ventaUnidades: 4_000_000n,
    monedaIso: 'COP',
    trm: null,
    lineas: [linea(M1, 3_000_000n)],
  };

  it('conserva lo vendido tal cual y arma las reservas desde las líneas', () => {
    const a = abrirArchivoDeViaje(venta);
    expect(a.venta).toBe(venta);
    expect(a.reservas).toEqual([
      {
        mayoristaId: M1,
        mayoristaNombre: 'Mayorista Uno',
        netoUnidades: 3_000_000n,
        monedaIso: 'COP',
      },
    ]);
  });
});
