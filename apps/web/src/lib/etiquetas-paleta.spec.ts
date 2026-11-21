import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORES_DE_ETIQUETA } from '@viajapro/contracts';

/**
 * Contraste AA de la paleta de etiquetas (HU-inbox-1 §3 y criterios de aceptación): cada par de
 * fondo y texto de cada color mide ≥ 4,5:1, en claro y en oscuro. Lee `globals.css`, que es la
 * fuente de los tokens: si alguien cambia un tono y rompe el contraste, esto se pone en rojo.
 */
const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

function bloque(selector: string): string {
  const inicio = css.indexOf(selector);
  expect(inicio, `no se encontró ${selector} en globals.css`).toBeGreaterThan(-1);
  return css.slice(inicio, css.indexOf('\n}', inicio));
}

function token(texto: string, nombre: string): string {
  const m = new RegExp(`--color-etiqueta-${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(texto);
  expect(m, `falta el token --color-etiqueta-${nombre}`).not.toBeNull();
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

describe('paleta de etiquetas: contraste AA (≥ 4,5:1)', () => {
  const temas = [
    ['claro', bloque('@theme {')],
    ['oscuro', bloque('.dark {')],
  ] as const;

  for (const [tema, texto] of temas) {
    for (const color of COLORES_DE_ETIQUETA) {
      it(`${color} en ${tema}: fondo y texto`, () => {
        const ratio = contraste(token(texto, `${color}-fondo`), token(texto, `${color}-texto`));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('los tres tokens existen para cada color (fondo, texto y punto)', () => {
    for (const color of COLORES_DE_ETIQUETA) {
      for (const parte of ['fondo', 'texto', 'punto']) {
        expect(token(bloque('@theme {'), `${color}-${parte}`)).toMatch(/^#/);
      }
    }
  });
});
