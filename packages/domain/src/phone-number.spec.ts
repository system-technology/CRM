import { describe, expect, it } from 'vitest';
import { PhoneNumber, TelefonoInvalidoError } from './phone-number.js';

describe('PhoneNumber', () => {
  it('acepta E.164 tal cual', () => {
    expect(PhoneNumber.parse('+573001234567').e164).toBe('+573001234567');
  });

  it('normaliza espacios, guiones, paréntesis y puntos', () => {
    expect(PhoneNumber.parse(' +57 (300) 123-45.67 ').e164).toBe('+573001234567');
  });

  it('convierte el prefijo 00 en +', () => {
    expect(PhoneNumber.parse('0057 300 1234567').e164).toBe('+573001234567');
  });

  it('rechaza un número sin código de país en vez de adivinarlo', () => {
    expect(() => PhoneNumber.parse('3001234567')).toThrow(TelefonoInvalidoError);
  });

  it('rechaza letras, cero inicial tras el + y longitudes fuera de rango', () => {
    for (const malo of ['+57abc', '+0573001234567', '+5712345', '+1234567890123456', '']) {
      expect(() => PhoneNumber.parse(malo)).toThrow(TelefonoInvalidoError);
    }
  });

  it('dos escrituras del mismo número son iguales', () => {
    expect(PhoneNumber.parse('+57 300 123 4567').equals(PhoneNumber.parse('0057-3001234567'))).toBe(
      true,
    );
  });
});
