import { describe, expect, it } from 'vitest';
import {
  MINUTOS_SLA_PRIMERA_RESPUESTA_POR_DEFECTO,
  slaTrasEntrante,
} from './plazo-de-primera-respuesta.js';

const T = new Date('2026-11-15T10:00:00.000Z');
const nada = { slaVenceEn: null, primeraRespuestaEn: null };

describe('slaTrasEntrante', () => {
  it('el primer entrante sin respuesta fija instante + plazo por defecto', () => {
    expect(slaTrasEntrante(nada, T)?.toISOString()).toBe(
      new Date(T.getTime() + MINUTOS_SLA_PRIMERA_RESPUESTA_POR_DEFECTO * 60_000).toISOString(),
    );
  });

  it('usa los minutos de la agencia cuando se pasan', () => {
    expect(slaTrasEntrante(nada, T, 60)?.toISOString()).toBe('2026-11-15T11:00:00.000Z');
  });

  it('un plazo ya corriendo no se mueve', () => {
    const corriendo = {
      slaVenceEn: new Date('2026-11-15T09:30:00.000Z'),
      primeraRespuestaEn: null,
    };
    expect(slaTrasEntrante(corriendo, T)).toBeNull();
  });

  it('tras la primera respuesta no se arma de nuevo', () => {
    expect(slaTrasEntrante({ slaVenceEn: null, primeraRespuestaEn: T }, T)).toBeNull();
    expect(
      slaTrasEntrante({ slaVenceEn: new Date(T.getTime() - 1), primeraRespuestaEn: T }, T),
    ).toBeNull();
  });
});
