/**
 * Las cuatro combinaciones de la regla de pérdida. No hay una quinta.
 *
 * Esta prueba existe porque esta regla perdió sus dos redes: no está en el esquema Zod —la
 * etapa viaja como id— ni en un `CHECK` —exige leer otra tabla—. Si falla aquí, no falla en
 * ningún otro sitio.
 */

import { describe, expect, it } from 'vitest';
import { comprobarMotivoDePerdida } from './regla-de-perdida.js';

describe('comprobarMotivoDePerdida', () => {
  it('etapa de pérdida SIN motivo → falta el motivo', () => {
    expect(comprobarMotivoDePerdida(true, null)).toBe('FALTA_MOTIVO');
  });

  it('etapa de pérdida CON motivo → pasa', () => {
    expect(comprobarMotivoDePerdida(true, 'PRECIO')).toBeNull();
  });

  it('etapa viva CON motivo → el motivo sobra', () => {
    // Devolver una tarjeta a negociación con el motivo pegado hace que el informe de pérdidas
    // cuente una que no existe.
    expect(comprobarMotivoDePerdida(false, 'PRECIO')).toBe('MOTIVO_SOBRANTE');
  });

  it('etapa viva SIN motivo → pasa', () => {
    expect(comprobarMotivoDePerdida(false, null)).toBeNull();
  });

  it('no mira la clave de la etapa, solo si es terminal de pérdida', () => {
    // Una agencia puede llamar «Se fue con otra» a su etapa de pérdida y no tener clave
    // canónica. La regla la trata igual, que es justo lo que R12 pide.
    expect(comprobarMotivoDePerdida(true, null)).toBe('FALTA_MOTIVO');
    expect(comprobarMotivoDePerdida(true, 'COMPRO_EN_OTRA_AGENCIA')).toBeNull();
  });
});
