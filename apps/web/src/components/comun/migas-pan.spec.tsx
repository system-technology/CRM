import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MigasPan } from './migas-pan';

const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
    push: vi.fn(),
  }),
}));

describe('MigasPan (Breadcrumbs con identidad de viaje)', () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  it('renderiza la ruta con nav semántico y aria-label', () => {
    render(
      <MigasPan
        elementos={[
          { label: 'Catálogo', href: '/catalogo' },
          { label: 'Pasadía Islas del Rosario VIP' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: /Migas de pan/i });
    expect(nav).toBeDefined();

    expect(screen.getByRole('link', { name: /Inicio/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /Catálogo/i })).toBeDefined();
    expect(screen.getByText('Pasadía Islas del Rosario VIP')).toBeDefined();

    const actual = screen.getByTestId('miga-pagina-actual');
    expect(actual.getAttribute('aria-current')).toBe('page');
  });

  it('permite retroceder con el botón volver', () => {
    render(
      <MigasPan
        conBotonVolver={true}
        elementos={[{ label: 'Cotizador', href: '/cotizador' }, { label: 'Nueva Cotización' }]}
      />,
    );

    const btnVolver = screen.getByTestId('boton-volver-migas');
    expect(btnVolver).toBeDefined();
    fireEvent.click(btnVolver);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('ejecuta alVolver personalizado si se suministra', () => {
    const customVolver = vi.fn();
    render(
      <MigasPan
        conBotonVolver={true}
        alVolver={customVolver}
        elementos={[{ label: 'Viajes' }, { label: 'EXP-2026-001' }]}
      />,
    );

    fireEvent.click(screen.getByTestId('boton-volver-migas'));
    expect(customVolver).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renderiza la acción principal destacada', () => {
    const handleAccion = vi.fn();
    render(
      <MigasPan
        elementos={[{ label: 'Bandeja', href: '/bandeja' }, { label: 'Chat con Laura' }]}
        accionPrincipal={{
          label: 'Cotizar Pasadía',
          onClick: handleAccion,
        }}
      />,
    );

    const accionBtn = screen.getByTestId('accion-principal-migas');
    expect(accionBtn.textContent).toContain('Cotizar Pasadía');
    fireEvent.click(accionBtn);
    expect(handleAccion).toHaveBeenCalledTimes(1);
  });
});
