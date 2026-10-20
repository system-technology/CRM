import { describe, expect, it } from 'vitest';
import { origenEsDeConfianza } from './origen.js';

const WEB = ['http://localhost:3000'];

describe('origenEsDeConfianza', () => {
  it('acepta el origen de la web', () => {
    expect(origenEsDeConfianza('http://localhost:3000', WEB)).toBe(true);
  });

  it('compara el ORIGEN, no la cadena: una ruta o una barra final no cambian la respuesta', () => {
    expect(origenEsDeConfianza('http://localhost:3000/', WEB)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'null',
    'https://sitio-malicioso.example',
    'http://localhost:3001',
    'https://localhost:3000',
    'http://localhost:3000.evil.example',
    'no-es-una-url',
  ])('rechaza %j', (origen) => {
    expect(origenEsDeConfianza(origen, WEB)).toBe(false);
  });

  it('sin orígenes de confianza no acepta nada', () => {
    expect(origenEsDeConfianza('http://localhost:3000', [])).toBe(false);
  });
});
