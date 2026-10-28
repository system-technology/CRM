import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TerminosServicioPage from './page';

describe('TerminosServicioPage (T-108) - Términos del servicio públicos', () => {
  it('1. Renderiza el título principal y la marca visible de borrador en revisión jurídica', () => {
    render(<TerminosServicioPage />);

    expect(
      screen.getByRole('heading', {
        name: /Términos del Servicio/i,
      }),
    ).toBeDefined();

    const badgeBorrador = screen.getByTestId('badge-borrador');
    expect(badgeBorrador).toBeDefined();
    expect(badgeBorrador.textContent).toContain('Borrador en revisión jurídica');
  });

  it('2. Incluye las obligaciones de uso de Meta WhatsApp Cloud API', () => {
    render(<TerminosServicioPage />);

    expect(screen.getByText(/ventana de conversación de 24 horas/i)).toBeDefined();
    expect(screen.getByText(/plantillas pre-aprobadas/i)).toBeDefined();
    expect(
      screen.getByText(/Prohibición absoluta del envío masivo no solicitado \(SPAM\)/i),
    ).toBeDefined();
  });

  it('3. Incluye la cláusula obligatoria de prevención de ESCNNA bajo leyes colombianas', () => {
    render(<TerminosServicioPage />);

    expect(
      screen.getByText(/Explotación Sexual Comercial de Niños, Niñas y Adolescentes \(ESCNNA\)/i),
    ).toBeDefined();
    expect(screen.getByText(/Leyes 679 de 2001/i)).toBeDefined();
    expect(screen.getByText(/1336 de 2009/i)).toBeDefined();
  });

  it('4. Declara la titularidad exclusiva de los datos por parte de la agencia y la jurisdicción en Colombia', () => {
    render(<TerminosServicioPage />);

    expect(
      screen.getByText(/No vender ni explotar comercialmente las listas de viajeros/i),
    ).toBeDefined();
    expect(screen.getByText(/Ley 300 de 1996 \(Ley General de Turismo\)/i)).toBeDefined();
  });
});
