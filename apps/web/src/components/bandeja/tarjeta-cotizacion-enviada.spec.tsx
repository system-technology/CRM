import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TarjetaCotizacionEnviada } from './tarjeta-cotizacion-enviada';
import * as api from '../../lib/cotizaciones-api';

describe('TarjetaCotizacionEnviada (T-178)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('si la cotización no carga, muestra solo el texto enviado y un enlace; sin datos inventados', async () => {
    vi.spyOn(api, 'obtenerCotizacionGuardadaApi').mockRejectedValue(new Error('404'));
    const { container } = render(
      <TarjetaCotizacionEnviada cotizacionId="cot-1" texto="Hola, tu propuesta" />,
    );
    await waitFor(() => expect(screen.getByTestId('cotizacion-respaldo')).toBeDefined());
    expect(container.textContent).toContain('Hola, tu propuesta');
    expect(container.textContent).not.toContain('Cancún');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/cotizaciones/cot-1');
  });
});
