import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MigasDePan } from './migas-de-pan';
import { Home, FileText } from 'lucide-react';

describe('MigasDePan (T-034) — Navegación de migas de pan para pantallas de detalle', () => {
  it('no renderiza nada si la lista de elementos está vacía', () => {
    const { container } = render(<MigasDePan elementos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la jerarquía de migas accesible con lista ordenada y separadores', () => {
    render(
      <MigasDePan
        elementos={[
          { etiqueta: 'Inicio', href: '/', icono: Home },
          { etiqueta: 'Cotizaciones', href: '/cotizaciones' },
          { etiqueta: 'Cotización #COT-2026-042', icono: FileText },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: /Migas de pan/i });
    expect(nav).toBeDefined();

    const enlaceInicio = screen.getByRole('link', { name: /Inicio/i });
    expect(enlaceInicio.getAttribute('href')).toBe('/');

    const enlaceCotizaciones = screen.getByRole('link', { name: /Cotizaciones/i });
    expect(enlaceCotizaciones.getAttribute('href')).toBe('/cotizaciones');

    const migaActiva = screen.getByTestId('miga-activa');
    expect(migaActiva.textContent).toContain('Cotización #COT-2026-042');
    expect(migaActiva.getAttribute('aria-current')).toBe('page');
  });

  it('renderiza el botón de retroceso opcional con touch target >= 44px', () => {
    render(
      <MigasDePan
        elementos={[
          { etiqueta: 'Inicio', href: '/' },
          { etiqueta: 'Bandeja', href: '/bandeja' },
          { etiqueta: 'Carlos Mendoza' },
        ]}
        mostrarBotonVolver
        volverHref="/bandeja"
        volverTexto="Volver a Bandeja"
      />,
    );

    const botonVolver = screen.getByTestId('boton-volver-migas');
    expect(botonVolver).toBeDefined();
    expect(botonVolver.getAttribute('href')).toBe('/bandeja');
    expect(botonVolver.getAttribute('aria-label')).toBe('Volver a Bandeja');
    expect(botonVolver.className).toContain('min-h-[44px]');
    expect(botonVolver.className).toContain('min-w-[44px]');
  });
});
