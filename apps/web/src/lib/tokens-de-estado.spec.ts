import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tokens de estado, plazo y canal (T-443): cada par de fondo y texto mide ≥ 4,5:1 (AA), en claro y en
 * oscuro. Lee `globals.css`, que es la fuente: si alguien cambia un tono y rompe el contraste, esto se
 * pone en rojo. También fija que existan las utilidades de objetivo táctil (T-441) y de texto mínimo.
 */
const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

const ESTADOS = [
  'plazo-vencido',
  'plazo-hoy',
  'plazo-proximo',
  'plazo-ok',
  'canal-whatsapp',
  'demo',
] as const;

function bloque(selector: string): string {
  const inicio = css.indexOf(selector);
  expect(inicio, `no se encontró ${selector} en globals.css`).toBeGreaterThan(-1);
  return css.slice(inicio, css.indexOf('\n}', inicio));
}

function token(texto: string, nombre: string): string {
  const m = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(texto);
  expect(m, `falta el token --color-${nombre}`).not.toBeNull();
  return (m as RegExpExecArray)[1] as string;
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

describe('tokens de estado, plazo y canal: contraste AA (≥ 4,5:1)', () => {
  const temas = [
    ['claro', bloque('@theme {')],
    ['oscuro', bloque('.dark {')],
  ] as const;

  for (const [tema, texto] of temas) {
    for (const estado of ESTADOS) {
      it(`${estado} en ${tema}: fondo y texto`, () => {
        const ratio = contraste(token(texto, `${estado}-fondo`), token(texto, `${estado}-texto`));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('el texto de WhatsApp sobre blanco también mide ≥ 4,5:1 (botón de enviar)', () => {
    expect(
      contraste(token(bloque('@theme {'), 'canal-whatsapp-texto'), '#ffffff'),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('vencido y hoy son rojo y próximo es ámbar (regla de diseno-web)', () => {
    const claro = bloque('@theme {');
    expect(token(claro, 'plazo-vencido-texto')).toBe(token(claro, 'plazo-hoy-texto'));
    expect(token(claro, 'plazo-proximo-texto')).not.toBe(token(claro, 'plazo-vencido-texto'));
  });
});

describe('utilidades de presentación', () => {
  it('«objetivo» fija 44 px solo con puntero táctil', () => {
    const inicio = css.indexOf('@utility objetivo');
    expect(inicio).toBeGreaterThan(-1);
    const texto = css.slice(inicio, css.indexOf('\n}\n', inicio));
    expect(texto).toContain('@media (pointer: coarse)');
    expect(texto).toContain('min-height: 44px');
    expect(texto).toContain('min-width: 44px');
  });

  it('el texto mínimo es 11 px y solo existe como utilidad «texto-micro»', () => {
    expect(css).toMatch(/--text-micro:\s*0\.6875rem/);
    expect(css).toContain('@utility texto-micro');
  });
});
