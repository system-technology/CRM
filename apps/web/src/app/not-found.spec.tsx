import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound 404 (T-109)', () => {
  it('renderiza la cabecera 404 con identidad turística y mensaje en español claro', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Esta ruta no está en nuestro mapa',
    );
    expect(screen.getByText('404')).toBeDefined();
    expect(screen.getByText(/Coordenadas extraviadas/i)).toBeDefined();
    expect(
      screen.getByText(/El destino, cotización o recurso que intentas consultar/i),
    ).toBeDefined();
  });

  it('proporciona enlace principal hacia la bandeja y accesos directos con touch target >= 44px', () => {
    render(<NotFound />);

    const linkBandeja = screen.getByTestId('enlace-volver-bandeja');
    expect(linkBandeja.getAttribute('href')).toBe('/bandeja');

    const linkCotizador = screen.getByTestId('enlace-rapido-cotizador');
    expect(linkCotizador.getAttribute('href')).toBe('/cotizador');

    const linkCatalogo = screen.getByTestId('enlace-rapido-catalogo');
    expect(linkCatalogo.getAttribute('href')).toBe('/catalogo');

    const linkPipeline = screen.getByTestId('enlace-rapido-pipeline');
    expect(linkPipeline.getAttribute('href')).toBe('/pipeline');
  });
});
