import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InsigniaDeVentanaEnFila } from './insignia-ventana-fila';

describe('InsigniaDeVentanaEnFila', () => {
  afterEach(cleanup);

  it('cerrada NO usa el verde de éxito', () => {
    render(<InsigniaDeVentanaEnFila nivel="cerrada" texto="Ventana cerrada" />);
    const el = screen.getByTestId('ventana-fila');
    expect(el.textContent).toBe('24h Cerrada');
    expect(el.className).not.toMatch(/\bok-/);
    expect(el.className).toMatch(/neutral/);
  });

  it.each([
    ['abierta', 'ok-', '11 h 59 min'],
    ['ambar', 'amber-', '34 min'],
    ['rojo', 'alerta-', '9 min'],
  ] as const)('%s tiene su propio color y su texto', (nivel, clase, texto) => {
    render(<InsigniaDeVentanaEnFila nivel={nivel} texto={texto} />);
    const el = screen.getByTestId('ventana-fila');
    expect(el.className).toContain(clase);
    expect(el.textContent).toContain(texto);
  });

  it('ámbar y rojo avisan también sin color (texto para lector de pantalla)', () => {
    render(<InsigniaDeVentanaEnFila nivel="rojo" texto="9 min" />);
    expect(screen.getByTestId('ventana-fila').textContent).toContain('a punto de cerrar');
  });
});
