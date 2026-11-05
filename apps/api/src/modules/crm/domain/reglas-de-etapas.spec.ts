import { describe, expect, it } from 'vitest';
import { OrdenDeEtapasInvalidoError, SinEtapaInicialError } from './errors.js';
import { exigirEtapaViva, exigirPermutacion } from './reglas-de-etapas.js';

describe('exigirEtapaViva', () => {
  it('acepta si hay al menos una etapa viva', () => {
    expect(() =>
      exigirEtapaViva([
        { esGanada: false, esPerdida: false },
        { esGanada: true, esPerdida: false },
      ]),
    ).not.toThrow();
  });

  it('rechaza si todas son terminales o no hay ninguna', () => {
    expect(() => exigirEtapaViva([{ esGanada: true, esPerdida: false }])).toThrow(
      SinEtapaInicialError,
    );
    expect(() => exigirEtapaViva([])).toThrow(SinEtapaInicialError);
  });
});

describe('exigirPermutacion', () => {
  it('acepta cualquier permutación', () => {
    expect(() => exigirPermutacion(['a', 'b', 'c'], ['c', 'a', 'b'])).not.toThrow();
  });

  it('rechaza faltantes, sobrantes, repetidos y ajenos', () => {
    for (const pedido of [
      ['a', 'b'],
      ['a', 'b', 'c', 'd'],
      ['a', 'a', 'b'],
      ['a', 'b', 'x'],
    ]) {
      expect(() => exigirPermutacion(['a', 'b', 'c'], pedido)).toThrow(OrdenDeEtapasInvalidoError);
    }
  });
});
