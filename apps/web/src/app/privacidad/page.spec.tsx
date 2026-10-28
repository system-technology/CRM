import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PoliticaPrivacidadPage from './page';

describe('PoliticaPrivacidadPage (T-108) - Página pública de privacidad y tratamiento de datos', () => {
  it('1. Renderiza el encabezado principal y el badge de borrador visible', () => {
    render(<PoliticaPrivacidadPage />);

    expect(
      screen.getByRole('heading', {
        name: /Política de Privacidad y Tratamiento de Datos/i,
      }),
    ).toBeDefined();

    const badgeBorrador = screen.getByTestId('badge-borrador');
    expect(badgeBorrador).toBeDefined();
    expect(badgeBorrador.textContent).toContain('Borrador en revisión jurídica');
  });

  it('2. Presenta la distinción de roles de Responsable (Agencia) y Encargado (ViajaPro)', () => {
    render(<PoliticaPrivacidadPage />);

    expect(screen.getByText(/La Agencia de Turismo:/i)).toBeDefined();
    expect(screen.getByText(/ViajaPro \(Plataforma\):/i)).toBeDefined();
    expect(screen.getAllByText(/Ley 1581 de 2012 y Decreto 1074 de 2015/i).length).toBeGreaterThan(
      0,
    );
  });

  it('3. Detalla las categorías de datos con especial énfasis en documentos de viaje y menores', () => {
    render(<PoliticaPrivacidadPage />);

    expect(screen.getByText('Documentos de Viaje')).toBeDefined();
    expect(screen.getByText(/Pasajeros niños \(CHD\) e infantes \(INF\)/i)).toBeDefined();
    expect(screen.getByText(/Cifrado AES-256-GCM y auditoría de lecturas/i)).toBeDefined();
  });

  it('4. Informa los derechos del titular según el Artículo 8 de la Ley 1581', () => {
    render(<PoliticaPrivacidadPage />);

    expect(screen.getByText(/Conocer, actualizar y rectificar/i)).toBeDefined();
    expect(
      screen.getByText(/Presentar quejas ante la Superintendencia de Industria y Comercio/i),
    ).toBeDefined();
    expect(screen.getByText(/privacidad@viajapro\.com/i)).toBeDefined();
  });
});
