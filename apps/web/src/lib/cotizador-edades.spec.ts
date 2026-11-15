import { describe, expect, it } from 'vitest';
import {
  ajustarLongitud,
  edadesParaEnviar,
  faltanEdades,
  interpretarEdad,
} from './cotizador-edades';

const base = { ninos: 0, infantes: 0, edadesNinos: [], edadesInfantes: [], infantesConSilla: [] };

describe('edades del cotizador (T-179)', () => {
  it('sin niños ni infantes no añade nada', () => {
    expect(edadesParaEnviar(base)).toEqual({});
  });

  it('envía la edad de cada niño cuando están todas', () => {
    expect(edadesParaEnviar({ ...base, ninos: 2, edadesNinos: [7, 3] })).toEqual({
      edadesNinos: [7, 3],
    });
  });

  it('una edad a medias NO se envía ni se inventa', () => {
    const e = { ...base, ninos: 2, edadesNinos: [7, null] };
    expect(edadesParaEnviar(e)).toEqual({});
    expect(faltanEdades(e)).toBe(true);
  });

  it('si se reduce el número de niños se descartan las edades de sobra', () => {
    expect(edadesParaEnviar({ ...base, ninos: 1, edadesNinos: [7, 3] })).toEqual({
      edadesNinos: [7],
    });
  });

  it('infantes: cuenta cuántos ocupan silla, con o sin edad', () => {
    expect(edadesParaEnviar({ ...base, infantes: 2, infantesConSilla: [true, false] })).toEqual({
      infantesConSilla: 1,
    });
    expect(
      edadesParaEnviar({
        ...base,
        infantes: 2,
        edadesInfantes: [1, 0],
        infantesConSilla: [true, true],
      }),
    ).toEqual({ edadesInfantes: [1, 0], infantesConSilla: 2 });
  });

  it('ajustarLongitud conserva lo escrito y rellena con null', () => {
    expect(ajustarLongitud([5], 3)).toEqual([5, null, null]);
    expect(ajustarLongitud([5, 6, 7], 1)).toEqual([5]);
  });

  it('interpretarEdad rechaza vacío, decimales y fuera de rango', () => {
    expect(interpretarEdad('7', 17)).toBe(7);
    expect(interpretarEdad('0', 17)).toBe(0);
    expect(interpretarEdad('', 17)).toBeNull();
    expect(interpretarEdad('7.5', 17)).toBeNull();
    expect(interpretarEdad('18', 17)).toBeNull();
    expect(interpretarEdad('-1', 17)).toBeNull();
  });
});
