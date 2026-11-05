import { describe, it, expect } from 'vitest';
import type { VersionDeCotizacion } from '@viajapro/contracts';
import {
  compararVersionesCotizacion,
  determinarEfectoMonetario,
  formatearDeltaDinero,
  restarDinero,
} from './cotizaciones-diff';

const VERSION_1_BASE: VersionDeCotizacion = {
  id: '01932000-0000-7000-8000-000000000001',
  numero: 1,
  creadaEn: '2026-11-01T10:00:00Z',
  paqueteId: 'pkg-cartagena',
  paqueteNombre: 'Cartagena Mágica 4D/3N',
  destino: 'Cartagena',
  noches: 3,
  fechaSalida: '2026-12-10',
  vigenciaId: 'vig-1',
  vigenciaDesde: '2026-12-01',
  vigenciaHasta: '2026-12-20',
  deSalidaProgramada: true,
  adultos: 2,
  ninos: 0,
  infantes: 0,
  acomodacion: 'DOBLE',
  lineas: [
    {
      tarifaId: 'tar-hotel',
      nombre: 'Hotel Barú Playa 4★',
      unidad: 'POR_PERSONA',
      cubrePasajeros: 1,
      veces: 2,
      precioUnitario: { unidades: '1000000', moneda: 'COP' },
      total: { unidades: '2000000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '400000', moneda: 'COP' },
    },
    {
      tarifaId: 'tar-tour',
      nombre: 'Tour Islas del Rosario',
      unidad: 'POR_PERSONA',
      cubrePasajeros: 1,
      veces: 2,
      precioUnitario: { unidades: '250000', moneda: 'COP' },
      total: { unidades: '500000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '100000', moneda: 'COP' },
    },
  ],
  venta: { unidades: '2500000', moneda: 'COP' },
  neto: { unidades: '2000000', moneda: 'COP' },
  margen: { unidades: '500000', moneda: 'COP' },
  vigenteHasta: '2026-11-20',
};

const VERSION_2_MODIFICADA: VersionDeCotizacion = {
  id: '01932000-0000-7000-8000-000000000002',
  numero: 2,
  creadaEn: '2026-11-03T15:30:00Z',
  paqueteId: 'pkg-cartagena',
  paqueteNombre: 'Cartagena Mágica 4D/3N',
  destino: 'Cartagena',
  noches: 4, // Cambio de noches
  fechaSalida: '2026-12-15', // Cambio de fecha
  vigenciaId: 'vig-1',
  vigenciaDesde: '2026-12-01',
  vigenciaHasta: '2026-12-20',
  deSalidaProgramada: true,
  adultos: 2,
  ninos: 1, // +1 niño
  infantes: 0,
  acomodacion: 'TRIPLE', // Cambio acomodación
  lineas: [
    {
      tarifaId: 'tar-hotel',
      nombre: 'Hotel Barú Playa 4★',
      unidad: 'POR_PERSONA',
      cubrePasajeros: 1,
      veces: 3, // Pasa a 3 pasajeros
      precioUnitario: { unidades: '1000000', moneda: 'COP' },
      total: { unidades: '3000000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '600000', moneda: 'COP' },
    },
    // Tour removido
    {
      tarifaId: 'tar-traslado', // Nuevo cargo agregado
      nombre: 'Traslado Privado Aeropuerto',
      unidad: 'POR_GRUPO',
      cubrePasajeros: 3,
      veces: 1,
      precioUnitario: { unidades: '150000', moneda: 'COP' },
      total: { unidades: '150000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '30000', moneda: 'COP' },
    },
  ],
  venta: { unidades: '3150000', moneda: 'COP' },
  neto: { unidades: '2520000', moneda: 'COP' },
  margen: { unidades: '630000', moneda: 'COP' },
  vigenteHasta: '2026-11-25',
};

describe('cotizaciones-diff (T-128)', () => {
  describe('Aritmética monetaria exacta en enteros (R8)', () => {
    it('resta importes con BigInt manteniendo moneda ISO', () => {
      const res = restarDinero(
        { unidades: '3500000', moneda: 'COP' },
        { unidades: '2000000', moneda: 'COP' },
      );
      expect(res.unidades).toBe('1500000');
      expect(res.moneda).toBe('COP');

      const neg = restarDinero(
        { unidades: '1000000', moneda: 'COP' },
        { unidades: '1500000', moneda: 'COP' },
      );
      expect(neg.unidades).toBe('-500000');
      expect(neg.moneda).toBe('COP');
    });

    it('determina correctamente el efecto monetario (aumento, disminución, neutro)', () => {
      expect(determinarEfectoMonetario({ unidades: '50000', moneda: 'COP' })).toBe('AUMENTO');
      expect(determinarEfectoMonetario({ unidades: '-50000', moneda: 'COP' })).toBe('DISMINUCION');
      expect(determinarEfectoMonetario({ unidades: '0', moneda: 'COP' })).toBe('NEUTRO');
    });

    it('formatea diferencias con signo explícito y código ISO', () => {
      expect(formatearDeltaDinero({ unidades: '250000', moneda: 'COP' })).toBe('+ $ 250.000 COP');
      expect(formatearDeltaDinero({ unidades: '-120000', moneda: 'COP' })).toBe('- $ 120.000 COP');
      expect(formatearDeltaDinero({ unidades: '0', moneda: 'COP' })).toBe('$ 0 COP');
    });
  });

  describe('Comparación de parámetros y composición', () => {
    it('detecta cambios en pasajeros, fechas, noches y acomodación', () => {
      const diff = compararVersionesCotizacion(VERSION_1_BASE, VERSION_2_MODIFICADA, false);

      expect(diff.parametros.adultos.haCambiado).toBe(false);
      expect(diff.parametros.ninos.anterior).toBe(0);
      expect(diff.parametros.ninos.nuevo).toBe(1);
      expect(diff.parametros.ninos.haCambiado).toBe(true);

      expect(diff.parametros.totalPasajeros.anterior).toBe(2);
      expect(diff.parametros.totalPasajeros.nuevo).toBe(3);
      expect(diff.parametros.totalPasajeros.haCambiado).toBe(true);

      expect(diff.parametros.fechaSalida.anterior).toBe('2026-12-10');
      expect(diff.parametros.fechaSalida.nuevo).toBe('2026-12-15');
      expect(diff.parametros.fechaSalida.haCambiado).toBe(true);

      expect(diff.parametros.noches.anterior).toBe(3);
      expect(diff.parametros.noches.nuevo).toBe(4);
      expect(diff.parametros.noches.haCambiado).toBe(true);

      expect(diff.parametros.acomodacion.anterior).toBe('DOBLE');
      expect(diff.parametros.acomodacion.nuevo).toBe('TRIPLE');
      expect(diff.parametros.acomodacion.haCambiado).toBe(true);
    });
  });

  describe('Comparación línea por línea de precios', () => {
    it('clasifica líneas modificadas, eliminadas y agregadas con su delta correspondiente', () => {
      const diff = compararVersionesCotizacion(VERSION_1_BASE, VERSION_2_MODIFICADA, false);

      // Hotel Barú (modificada: 2x a 3x -> delta +1.000.000 COP)
      const lineaHotel = diff.lineas.find((l) => l.tarifaId === 'tar-hotel')!;
      expect(lineaHotel).toBeDefined();
      expect(lineaHotel.tipo).toBe('MODIFICADA');
      expect(lineaHotel.deltaTotal.unidades).toBe('1000000');
      expect(lineaHotel.efecto).toBe('AUMENTO');

      // Tour Islas del Rosario (eliminada en V2 -> delta -500.000 COP)
      const lineaTour = diff.lineas.find((l) => l.tarifaId === 'tar-tour')!;
      expect(lineaTour).toBeDefined();
      expect(lineaTour.tipo).toBe('ELIMINADA');
      expect(lineaTour.deltaTotal.unidades).toBe('-500000');
      expect(lineaTour.efecto).toBe('DISMINUCION');

      // Traslado privado (agregada en V2 -> delta +150.000 COP)
      const lineaTraslado = diff.lineas.find((l) => l.tarifaId === 'tar-traslado')!;
      expect(lineaTraslado).toBeDefined();
      expect(lineaTraslado.tipo).toBe('AGREGADA');
      expect(lineaTraslado.deltaTotal.unidades).toBe('150000');
      expect(lineaTraslado.efecto).toBe('AUMENTO');
    });
  });

  describe('Totales y efecto general sobre la cotización', () => {
    it('calcula la variación del total de venta y porcentaje', () => {
      const diff = compararVersionesCotizacion(VERSION_1_BASE, VERSION_2_MODIFICADA, false);

      // V1: 2.500.000, V2: 3.150.000 -> Delta: +650.000 COP (+26%)
      expect(diff.totales.ventaA.unidades).toBe('2500000');
      expect(diff.totales.ventaB.unidades).toBe('3150000');
      expect(diff.totales.deltaVenta.unidades).toBe('650000');
      expect(diff.totales.efectoVenta).toBe('AUMENTO');
      expect(diff.totales.porcentajeVariacionVenta).toBe(26);

      expect(diff.resumenEfectoTotal).toContain('El total aumentó en + $ 650.000 COP (+26.0 %)');
    });
  });

  describe('Aislamiento y seguridad de márgenes (ADR-0011 y R10)', () => {
    it('OMITE estrictamente neto y margen si puedeVerNetoYMargen es false', () => {
      const diff = compararVersionesCotizacion(VERSION_1_BASE, VERSION_2_MODIFICADA, false);

      // A nivel de totales consolidados
      expect(diff.totales.netoA).toBeUndefined();
      expect(diff.totales.netoB).toBeUndefined();
      expect(diff.totales.deltaNeto).toBeUndefined();
      expect(diff.totales.margenA).toBeUndefined();
      expect(diff.totales.margenB).toBeUndefined();
      expect(diff.totales.deltaMargen).toBeUndefined();

      // A nivel de cada línea
      for (const linea of diff.lineas) {
        expect(linea.margenA).toBeUndefined();
        expect(linea.margenB).toBeUndefined();
        expect(linea.deltaMargen).toBeUndefined();
      }
    });

    it('INCLUYE neto y margen cuando puedeVerNetoYMargen es true', () => {
      const diff = compararVersionesCotizacion(VERSION_1_BASE, VERSION_2_MODIFICADA, true);

      // V1 neto 2.000.000, V2 neto 2.520.000 -> delta +520.000
      expect(diff.totales.netoA?.unidades).toBe('2000000');
      expect(diff.totales.netoB?.unidades).toBe('2520000');
      expect(diff.totales.deltaNeto?.unidades).toBe('520000');

      // V1 margen 500.000, V2 margen 630.000 -> delta +130.000
      expect(diff.totales.margenA?.unidades).toBe('500000');
      expect(diff.totales.margenB?.unidades).toBe('630000');
      expect(diff.totales.deltaMargen?.unidades).toBe('130000');

      const lineaHotel = diff.lineas.find((l) => l.tarifaId === 'tar-hotel')!;
      expect(lineaHotel.margenA?.unidades).toBe('400000');
      expect(lineaHotel.margenB?.unidades).toBe('600000');
      expect(lineaHotel.deltaMargen?.unidades).toBe('200000');
    });
  });
});
