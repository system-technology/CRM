import { describe, expect, it } from 'vitest';
import { leerProxyDeConfianza } from './proxy-de-confianza.js';

describe('leerProxyDeConfianza', () => {
  it('por defecto no confía en ningún proxy', () => {
    expect(leerProxyDeConfianza({})).toBe(false);
    expect(leerProxyDeConfianza({ API_TRUST_PROXY: '' })).toBe(false);
    expect(leerProxyDeConfianza({ API_TRUST_PROXY: '0' })).toBe(false);
  });
  it('acepta un número de saltos o una lista', () => {
    expect(leerProxyDeConfianza({ API_TRUST_PROXY: '1' })).toBe(1);
    expect(leerProxyDeConfianza({ API_TRUST_PROXY: '10.0.0.1, 10.0.0.0/24' })).toEqual([
      '10.0.0.1',
      '10.0.0.0/24',
    ]);
  });
});
