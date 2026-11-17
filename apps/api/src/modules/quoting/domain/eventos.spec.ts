import { CotizacionAceptadaV1 } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CotizacionAceptadaSinVersionError, cotizacionAceptada } from './eventos.js';

const base = {
  cotizacionId: '11111111-1111-4111-8111-111111111111',
  versionEnviada: 2,
  contactoId: '22222222-2222-4222-8222-222222222222',
  oportunidadId: null,
  aceptadaPorUsuarioId: null,
  aceptadaEn: new Date('2026-11-17T15:30:00.000Z'),
};

describe('cotizacionAceptada', () => {
  it('arma el evento v1 del agregado cotizacion, con la versión que vio el cliente', () => {
    const e = cotizacionAceptada(base);
    expect(e).toMatchObject({
      agregado: 'cotizacion',
      agregadoId: base.cotizacionId,
      tipoEvento: 'quoting.cotizacion_aceptada',
      versionEvento: 1,
    });
    expect(CotizacionAceptadaV1.parse(e.payload)).toEqual({
      v: 1,
      cotizacionId: base.cotizacionId,
      version: 2,
      contactoId: base.contactoId,
      oportunidadId: null,
      aceptadaPorUsuarioId: null,
      aceptadaEn: '2026-11-17T15:30:00.000Z',
    });
  });

  it('sin versión enviada es un estado imposible: error tipado', () => {
    expect(() => cotizacionAceptada({ ...base, versionEnviada: null })).toThrow(
      CotizacionAceptadaSinVersionError,
    );
  });
});
