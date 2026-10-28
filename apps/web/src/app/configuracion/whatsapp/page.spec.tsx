import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ConfiguracionWhatsappPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/configuracion/whatsapp',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe('ConfiguracionWhatsappPage (/configuracion/whatsapp) (T-106)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
      writable: true,
      configurable: true,
    });
  });

  it('renderiza la cabecera con navegación, distintivos y enlace a Configuración General', () => {
    render(<ConfiguracionWhatsappPage />);

    expect(screen.getByText('Conexión Oficial de WhatsApp')).toBeDefined();
    expect(screen.getAllByText('T-106')[0]).toBeDefined();

    const linkVolver = screen.getByTestId('btn-volver-configuracion');
    expect(linkVolver.getAttribute('href')).toBe('/configuracion');

    const linkOnboarding = screen.getByTestId('btn-abrir-onboarding-desde-whatsapp');
    expect(linkOnboarding.getAttribute('href')).toBe('/bienvenida');
  });

  it('incluye el bloque interactivo de conexión de WhatsApp con la regla de 24 horas', () => {
    render(<ConfiguracionWhatsappPage />);

    expect(screen.getByTestId('bloque-conexion-whatsapp')).toBeDefined();
    expect(screen.getByText('¿Cómo Funciona la Ventana de 24 Horas de WhatsApp?')).toBeDefined();
    expect(screen.getByText('Plantillas Oficiales de Reenganche (HSM)')).toBeDefined();
  });
});
