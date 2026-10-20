import { describe, expect, it } from 'vitest';
import { asignacionTrasResponder } from './asignacion-de-conversacion.js';

const ANA = '01932000-0000-7000-8000-0000000000a1';
const DUENO = '01932000-0000-7000-8000-0000000000d1';

describe('asignacionTrasResponder', () => {
  it('responder una conversación sin asignar la toma', () => {
    expect(asignacionTrasResponder(null, ANA)).toBe(ANA);
  });
  it('si ya tiene asesor, responder no la reasigna (aunque responda el dueño)', () => {
    expect(asignacionTrasResponder(ANA, DUENO)).toBe(ANA);
  });
  it('sin autor no hay a quién asignar', () => {
    expect(asignacionTrasResponder(null, null)).toBeNull();
    expect(asignacionTrasResponder(ANA, null)).toBe(ANA);
  });
});
