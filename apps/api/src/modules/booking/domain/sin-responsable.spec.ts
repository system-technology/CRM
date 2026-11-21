import { describe, expect, it } from 'vitest';
import { motivoSinResponsable } from './sin-responsable.js';

const ELEGIBLES = new Set(['u-activo']);

describe('motivoSinResponsable', () => {
  it('con asesor activo y con el permiso, el archivo SÍ tiene responsable', () => {
    expect(
      motivoSinResponsable({ oportunidadId: 'o-1', asesorId: 'u-activo' }, ELEGIBLES),
    ).toBeNull();
  });

  it('sin oportunidad: nadie lo hereda, y es el caso que no falla pero desaparece', () => {
    expect(motivoSinResponsable({ oportunidadId: null, asesorId: null }, ELEGIBLES)).toBe(
      'SIN_OPORTUNIDAD',
    );
  });

  it('sin oportunidad manda sobre lo demás: aunque llegara un asesor, no hay de dónde', () => {
    expect(motivoSinResponsable({ oportunidadId: null, asesorId: 'u-activo' }, ELEGIBLES)).toBe(
      'SIN_OPORTUNIDAD',
    );
  });

  it('con oportunidad sin asesor asignado', () => {
    expect(motivoSinResponsable({ oportunidadId: 'o-1', asesorId: null }, ELEGIBLES)).toBe(
      'SIN_ASESOR',
    );
  });

  it('con asesor que ya no está activo o perdió archivo.operar: no elegible', () => {
    expect(motivoSinResponsable({ oportunidadId: 'o-1', asesorId: 'u-de-baja' }, ELEGIBLES)).toBe(
      'ASESOR_NO_ELEGIBLE',
    );
  });

  it('sin NADIE elegible en la agencia, hasta el asesor asignado deja de responder', () => {
    expect(motivoSinResponsable({ oportunidadId: 'o-1', asesorId: 'u-activo' }, new Set())).toBe(
      'ASESOR_NO_ELEGIBLE',
    );
  });
});
