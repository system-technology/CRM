import { describe, expect, it } from 'vitest';
import { ConsultarResumenDeReportes } from '@viajapro/contracts';
import {
  diasDelRango,
  inicioDeDiaEnZona,
  rangoAnterior,
  rangoDePeriodo,
  type PeriodoDeReporte,
} from './reportes-periodo';

// 2026-11-04 03:00 UTC = 2026-11-03 22:00 en Bogotá (UTC-5, sin horario de verano).
const AHORA = new Date('2026-11-04T03:00:00.000Z');

describe('reportes-periodo: periodo → instantes UTC con la zona de la agencia (R9)', () => {
  it('el día de Bogotá empieza a las 05:00 UTC', () => {
    expect(inicioDeDiaEnZona(2026, 11, 1, 'America/Bogota').toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    );
  });

  it('«este mes» usa el día local de la zona, no el de UTC', () => {
    // En UTC ya es 4 de noviembre; en Bogotá todavía es el 3.
    const r = rangoDePeriodo('este_mes', AHORA, 'America/Bogota');
    expect(r.desde).toBe('2026-11-01T05:00:00.000Z');
    // hasta exclusivo = inicio del día siguiente (4 nov 00:00 Bogotá)
    expect(r.hasta).toBe('2026-11-04T05:00:00.000Z');
  });

  it('«últimos 30 días» cuenta 30 días calendario contando hoy', () => {
    const r = rangoDePeriodo('ultimos_30_dias', AHORA, 'America/Bogota');
    expect(r.desde).toBe('2026-10-05T05:00:00.000Z');
    expect(r.hasta).toBe('2026-11-04T05:00:00.000Z');
    expect(diasDelRango(r)).toBe(30);
  });

  it('«trimestre» son 90 días y «año» empieza el 1 de enero local', () => {
    expect(diasDelRango(rangoDePeriodo('trimestre', AHORA, 'America/Bogota'))).toBe(90);
    expect(rangoDePeriodo('ano', AHORA, 'America/Bogota').desde).toBe('2026-01-01T05:00:00.000Z');
  });

  it('la misma fecha da instantes distintos según la zona', () => {
    const bogota = rangoDePeriodo('este_mes', AHORA, 'America/Bogota');
    const madrid = rangoDePeriodo('este_mes', AHORA, 'Europe/Madrid');
    expect(madrid.desde).toBe('2026-10-31T23:00:00.000Z'); // CET (UTC+1) en noviembre
    expect(madrid.desde).not.toBe(bogota.desde);
    // En Madrid ya es 4 de noviembre 04:00: hasta = 5 nov 00:00 CET
    expect(madrid.hasta).toBe('2026-11-04T23:00:00.000Z');
  });

  it('respeta el cambio de horario de verano dentro del mes', () => {
    // EE. UU. pasó a horario de verano el 8 de marzo de 2026.
    const r = rangoDePeriodo('este_mes', new Date('2026-03-09T12:00:00.000Z'), 'America/New_York');
    expect(r.desde).toBe('2026-03-01T05:00:00.000Z'); // EST (UTC-5)
    expect(r.hasta).toBe('2026-03-10T04:00:00.000Z'); // EDT (UTC-4)
  });

  it('todos los periodos pasan la validación del contrato (≤ 366 días, desde < hasta)', () => {
    const periodos: PeriodoDeReporte[] = ['ultimos_30_dias', 'este_mes', 'trimestre', 'ano'];
    for (const p of periodos) {
      for (const hoy of ['2026-12-31T20:00:00.000Z', '2028-12-31T20:00:00.000Z']) {
        expect(
          ConsultarResumenDeReportes.safeParse(rangoDePeriodo(p, new Date(hoy), 'America/Bogota'))
            .success,
        ).toBe(true);
      }
    }
  });

  it('el periodo anterior es contiguo y de igual duración', () => {
    const r = rangoDePeriodo('ultimos_30_dias', AHORA, 'America/Bogota');
    const previo = rangoAnterior(r);
    expect(previo?.hasta).toBe(r.desde);
    expect(previo && diasDelRango(previo)).toBe(30);
  });
});
