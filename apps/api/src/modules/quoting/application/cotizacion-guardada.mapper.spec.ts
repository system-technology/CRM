/**
 * T-217: la versión leída devuelve edades y silla, y la composición que se arma desde ella las
 * reenvía. Sin esto, volver a cotizar una versión con tarifa de menor respondía 422.
 */
import { ComposicionDeVersion, composicionDesdeVersion } from '@viajapro/contracts';
import type { VersionCotizacion } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { aVersionDeCotizacion } from './cotizacion-guardada.mapper.js';

const fila = (extra: Partial<VersionCotizacion> = {}): VersionCotizacion => ({
  id: '01932000-0000-7000-8000-000000000101',
  tenantId: '01932000-0000-7000-8000-00000000000a',
  cotizacionId: '01932000-0000-7000-8000-000000000102',
  numero: 1,
  paqueteId: '01932000-0000-7000-8000-000000000103',
  paqueteNombre: 'Puebleando',
  destino: 'Quindío',
  noches: 1,
  fechaSalida: new Date('2026-10-03T00:00:00Z'),
  vigenciaId: '01932000-0000-7000-8000-000000000104',
  vigenciaDesde: new Date('2026-10-03T00:00:00Z'),
  vigenciaHasta: new Date('2026-10-03T00:00:00Z'),
  deSalidaProgramada: true,
  adultos: 2,
  ninos: 1,
  infantes: 1,
  acomodacion: 'DOBLE',
  edadesNinos: [7],
  edadesInfantes: [1],
  infantesConSilla: 0,
  opcionDeSalidaId: null,
  politicaPorcentaje: new Prisma.Decimal(20),
  politicaBase: 'SOBRE_EL_NETO',
  politicaOrigen: 'DERIVADA_DEL_NETO',
  politicaRedondeo: 1000,
  lineas: [{ total: { unidades: '1070000', moneda: 'COP' } }],
  ventaUnidades: 1_070_000n,
  netoUnidades: null,
  margenUnidades: null,
  monedaIso: 'COP',
  vigenteHasta: null,
  creadoEn: new Date('2026-10-01T12:00:00Z'),
  creadoPorId: null,
  trmMonedaOrigen: null,
  trmMonedaDestino: null,
  trmValor: null,
  trmFecha: null,
  trmFuente: null,
  ...extra,
});

describe('versión guardada → composición (T-217)', () => {
  it('la lectura devuelve edades y silla, y la composición las reenvía', () => {
    const v = aVersionDeCotizacion(fila(), false);
    expect(v.edadesNinos).toEqual([7]);
    expect(v.edadesInfantes).toEqual([1]);
    expect(v.infantesConSilla).toBe(0);

    const c = composicionDesdeVersion(v);
    expect(c).toMatchObject({
      adultos: 2,
      ninos: 1,
      infantes: 1,
      edadesNinos: [7],
      edadesInfantes: [1],
      infantesConSilla: 0,
      acomodacion: 'DOBLE',
    });
    // Y es una composición válida para `POST /cotizaciones/:id/versiones`.
    expect(ComposicionDeVersion.safeParse(c).success).toBe(true);
  });

  it('una versión anterior a T-217 (sin edades) no inventa edades y sigue siendo válida', () => {
    const v = aVersionDeCotizacion(
      fila({ edadesNinos: [], edadesInfantes: [], infantesConSilla: null }),
      false,
    );
    const c = composicionDesdeVersion(v);
    expect(c).not.toHaveProperty('edadesNinos');
    expect(c).not.toHaveProperty('edadesInfantes');
    expect(c).not.toHaveProperty('infantesConSilla');
    expect(ComposicionDeVersion.safeParse(c).success).toBe(true);
  });
});
