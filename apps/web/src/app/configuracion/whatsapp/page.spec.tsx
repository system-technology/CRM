import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ConfiguracionWhatsappPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/configuracion/whatsapp',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('ConfiguracionWhatsappPage (/configuracion/whatsapp)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ conectado: false, canales: [] }),
      }),
    );
  });

  it('renderiza la cabecera con enlace a Configuración General', async () => {
    render(<ConfiguracionWhatsappPage />);
    expect(screen.getByText('Conexión Oficial de WhatsApp')).toBeDefined();
    expect(screen.getByTestId('btn-volver-configuracion').getAttribute('href')).toBe(
      '/configuracion',
    );
    await waitFor(() => expect(screen.getByTestId('estado-whatsapp-no-conectado')).toBeDefined());
  });
});
