import { describe, expect, it } from 'vitest';
import { limitesDelDia } from './limites-del-dia.js';

describe('limitesDelDia', () => {
  it('Bogotá (UTC-5): el día local empieza a las 05:00Z', () => {
    // 2026-10-27 02:00Z sigue siendo el 26 en Bogotá (21:00 del día anterior).
    const l = limitesDelDia('America/Bogota', new Date('2026-10-27T02:00:00Z'));
    expect(l.fecha).toBe('2026-10-26');
    expect(l.desde.toISOString()).toBe('2026-10-26T05:00:00.000Z');
    expect(l.hasta.toISOString()).toBe('2026-10-27T05:00:00.000Z');
  });

  it('el mismo instante en Madrid ya es otro día', () => {
    const l = limitesDelDia('Europe/Madrid', new Date('2026-10-27T02:00:00Z'));
    expect(l.fecha).toBe('2026-10-27');
    // Octubre 27 en Madrid es UTC+1 (el horario de verano acabó el 25).
    expect(l.desde.toISOString()).toBe('2026-10-26T23:00:00.000Z');
  });

  it('un día con cambio de horario dura 25 horas y no se descuadra', () => {
    const l = limitesDelDia('Europe/Madrid', new Date('2026-10-25T12:00:00Z'));
    expect(l.fecha).toBe('2026-10-25');
    expect((l.hasta.getTime() - l.desde.getTime()) / 3_600_000).toBe(25);
  });
});
