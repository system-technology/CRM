import { describe, expect, it } from 'vitest';
import { estaConectado } from './estado-del-canal.js';

describe('estaConectado', () => {
  it('solo si el número y la cuenta están activos', () => {
    expect(estaConectado('ACTIVO', 'ACTIVO')).toBe(true);
    expect(estaConectado('ACTIVO', 'SUSPENDIDO')).toBe(false);
    expect(estaConectado('SUSPENDIDO', 'ACTIVO')).toBe(false);
    expect(estaConectado('REVOCADO', 'REVOCADO')).toBe(false);
  });
});
