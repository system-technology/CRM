/**
 * T-061: la higiene del texto saliente. Los casos límite importan más que el camino feliz: son lo
 * que un viajero (o un asesor que pega desde un PDF) puede colar sin querer.
 */
import { describe, expect, it } from 'vitest';
import { EnviarTexto, limpiarTextoSaliente } from './inbox.js';

const CONVERSACION = '01932000-0000-7000-8000-0000000000cc';
const CLAVE = '01932000-0000-7000-8000-0000000000dd';

describe('limpiarTextoSaliente', () => {
  it('deja intacto el texto normal, con tildes, emojis, saltos de línea y tabulaciones', () => {
    const t = 'Hola, ¿cómo estás? ✈️🏝️\nLínea 2\tcon tabulación';
    expect(limpiarTextoSaliente(t)).toBe(t);
  });

  it('quita los caracteres de control C0 salvo \\n y \\t, y DEL', () => {
    expect(limpiarTextoSaliente('a\u0000b\u0001c\u0008d\u000Be\u000Cf\u001Fg\u007Fh')).toBe(
      'abcdefgh',
    );
    expect(limpiarTextoSaliente('a\nb\tc')).toBe('a\nb\tc');
  });

  it('quita los caracteres de control C1', () => {
    expect(limpiarTextoSaliente('a\u0080b\u009Fc')).toBe('abc');
  });

  it('quita los de formato bidireccional que invierten lo que ve el lector', () => {
    expect(limpiarTextoSaliente('pago‮.exe‬ ⁦x⁩ ‎ok‏')).toBe('pago.exe x ok');
  });

  it('normaliza \\r\\n y \\r a \\n y recorta los extremos', () => {
    expect(limpiarTextoSaliente('  uno\r\ndos\rtres  ')).toBe('uno\ndos\ntres');
  });

  it('un texto de solo control o espacios queda vacío', () => {
    expect(limpiarTextoSaliente('\u0000‮ \t\n ')).toBe('');
  });
});

describe('EnviarTexto — texto', () => {
  const base = { conversacionId: CONVERSACION, claveIdempotencia: CLAVE };

  it('entrega el texto ya limpio', () => {
    const r = EnviarTexto.parse({ ...base, texto: 'Hola\u0000 mundo\r\n' });
    expect(r.texto).toBe('Hola mundo');
  });

  it('rechaza un texto que queda vacío tras limpiarlo', () => {
    expect(EnviarTexto.safeParse({ ...base, texto: '\u0000‮  ' }).success).toBe(false);
    expect(EnviarTexto.safeParse({ ...base, texto: '' }).success).toBe(false);
  });

  it('rechaza más de 4096 caracteres sin procesarlos', () => {
    expect(EnviarTexto.safeParse({ ...base, texto: 'a'.repeat(4097) }).success).toBe(false);
    expect(EnviarTexto.safeParse({ ...base, texto: 'a'.repeat(4096) }).success).toBe(true);
  });
});
