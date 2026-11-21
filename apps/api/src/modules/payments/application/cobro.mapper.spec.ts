/**
 * T-582 (carril a): la fila de la vista de cobros trae el RECUENTO de pasajeros del archivo, no sus
 * nombres (R10). Sale de las columnas de composición del archivo, que el dominio de `booking` ya
 * obliga a cuadrar con la lista de pasajeros.
 */
import { FilaDeCobro } from '@viajapro/contracts';
import { SUMAS_EN_CERO } from '@viajapro/domain';
import { describe, expect, it } from 'vitest';
import type { ArchivoParaCobro } from '../../../shared/puertos/puertos-hacia-booking.js';
import { aFilaDeCobro, calcularParaArchivo } from './cobro.mapper.js';

const archivo: ArchivoParaCobro = {
  id: '0193c6e0-0000-7000-8000-000000000001',
  numero: 1043,
  contactoId: '0193c6e0-0000-7000-8000-000000000002',
  destino: 'San Andrés',
  fechaSalida: '2027-03-01',
  estado: 'ABIERTO',
  ventaUnidades: 2_400_000n,
  monedaIso: 'COP',
  creadoEn: new Date('2027-01-01T12:00:00.000Z'),
  pagoTotalVenceEn: null,
  adultos: 2,
  ninos: 1,
  infantes: 0,
};

const calculado = calcularParaArchivo(archivo, SUMAS_EN_CERO, {
  zonaHoraria: 'America/Bogota',
  diasDePlazo: 30,
  plazoManual: null,
  ahora: new Date('2027-01-02T12:00:00.000Z'),
});

describe('aFilaDeCobro: pasajeros', () => {
  it('trae el recuento por tipo y el total', () => {
    expect(aFilaDeCobro(archivo, calculado).pasajeros).toEqual({
      adultos: 2,
      ninos: 1,
      infantes: 0,
      total: 3,
    });
  });

  it('cumple el contrato y solo lleva cifras, ningún nombre', () => {
    const fila = aFilaDeCobro(archivo, calculado);
    expect(FilaDeCobro.parse(fila)).toEqual(fila);
    expect(Object.keys(fila.pasajeros ?? {}).sort()).toEqual([
      'adultos',
      'infantes',
      'ninos',
      'total',
    ]);
  });
});
