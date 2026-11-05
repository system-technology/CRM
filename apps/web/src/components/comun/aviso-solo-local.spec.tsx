import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoSoloLocal } from './aviso-solo-local';

describe('AvisoSoloLocal (T-124)', () => {
  it('dice que los datos son solo de este navegador cuando es visible', () => {
    render(<AvisoSoloLocal que="las respuestas rápidas" visible />);
    expect(screen.getByRole('note').textContent).toMatch(/Solo en este navegador/);
    expect(screen.getByRole('note').textContent).toMatch(/Las respuestas rápidas/);
  });

  it('no se muestra cuando se fuerza oculto', () => {
    render(<AvisoSoloLocal que="los campos" visible={false} />);
    expect(screen.queryByTestId('aviso-solo-local')).toBeNull();
  });
});
