import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelIngreso } from './panel-ingreso';
import {
  PANEL_INGRESO_POR_OMISION,
  destinosDelPie,
  type ConfiguracionPanelIngreso,
} from '../../lib/panel-ingreso';

function simularMedios(coincide: (consulta: string) => boolean) {
  vi.stubGlobal(
    'matchMedia',
    (consulta: string) =>
      ({
        matches: coincide(consulta),
        media: consulta,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

const PERUANA: ConfiguracionPanelIngreso = {
  insignia: 'Operación Perú',
  etiqueta: 'Viajes por el Perú',
  titular: { inicio: 'Vende el Perú', destacado: 'sin fronteras' },
  subtitulo: 'Subtítulo propio de la agencia.',
  pie: 'Pie propio',
  fotos: [
    {
      destino: 'Cusco',
      alt: 'Calle de Cusco',
      avif: '/x/cusco.avif',
      webp: '/x/cusco.webp',
      ancho: 100,
      alto: 100,
    },
    {
      destino: 'Arequipa',
      alt: 'El Misti',
      avif: '/x/arequipa.avif',
      webp: '/x/arequipa.webp',
      ancho: 100,
      alto: 100,
    },
  ],
};

describe('PanelIngreso (T-620)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    simularMedios(() => false);
  });

  it('por omisión muestra el paquete estándar: sus destinos salen de las fotos', () => {
    render(<PanelIngreso />);
    expect(screen.getByText('Operación Colombia')).toBeTruthy();
    expect(destinosDelPie(PANEL_INGRESO_POR_OMISION)).toEqual([
      'Cartagena',
      'Santa Marta',
      'Barranquilla',
      'Barú',
    ]);
    // El pie nombra lo que se ve: no queda ningún destino que no tenga foto.
    expect(screen.queryByText(/San Andrés/)).toBeNull();
  });

  it('no sabe nada de Colombia: con la configuración de otra agencia solo aparece la suya', () => {
    const { container } = render(<PanelIngreso configuracion={PERUANA} />);
    expect(screen.getByText('Operación Perú')).toBeTruthy();
    expect(screen.getByText('sin fronteras')).toBeTruthy();
    expect(screen.getByText('Pie propio')).toBeTruthy();
    expect(screen.getByText('Cusco')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Colombia|Cartagena|Santa Marta/);
  });

  it('solo la primera foto está en el DOM al empezar, con prioridad alta y su texto alternativo', () => {
    const { container } = render(<PanelIngreso configuracion={PERUANA} />);
    const imagenes = container.querySelectorAll('picture img');
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0]?.getAttribute('fetchpriority')).toBe('high');
    expect(imagenes[0]?.getAttribute('alt')).toBe('Calle de Cusco');
    expect(container.querySelector('source[type="image/avif"]')?.getAttribute('srcset')).toBe(
      '/x/cusco.avif',
    );
  });

  it('sin fotos no rompe: queda el degradado de marca', () => {
    const { container } = render(<PanelIngreso configuracion={{ ...PERUANA, fotos: [] }} />);
    expect(container.querySelector('picture')).toBeNull();
    expect(screen.getByText('Vende el Perú', { exact: false })).toBeTruthy();
  });

  it('los destinos del pie pueden indicarse aparte de las fotos', () => {
    expect(destinosDelPie({ ...PERUANA, destinosDelPie: ['Lima'] })).toEqual(['Lima']);
  });
});
