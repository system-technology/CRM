import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TarjetaCotizacion } from './tarjeta-cotizacion';
import { formatearDinero } from '../../lib/formato';

describe('TarjetaCotizacion: dinero en unidad mínima (R8)', () => {
  it('COP: 5.000.000 pesos se muestra como $ 5.000.000, sin dividir entre 100', () => {
    const { container } = render(
      <TarjetaCotizacion titulo="Cancún" unidades="5000000" moneda="COP" />,
    );
    expect(container.textContent).toContain('$ 5.000.000');
  });

  it('USD: 125000 centavos se muestra como 1.250,00', () => {
    const { container } = render(
      <TarjetaCotizacion titulo="Miami" unidades="125000" moneda="USD" />,
    );
    expect(container.textContent).toContain('1.250,00');
  });

  it('formatearDinero respeta decimales por moneda', () => {
    expect(formatearDinero({ unidades: '5000000', moneda: 'COP' })).toBe('$ 5.000.000');
    expect(formatearDinero({ unidades: '1250', moneda: 'USD' })).toContain('12,50');
  });
});
