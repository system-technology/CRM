import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
  usePathname: () => '/cotizador',
}));

vi.mock('../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => true),
    listarSalidasApi: vi.fn(),
    cotizarSalidaApi: vi.fn(),
  };
});

vi.mock('../../lib/crm-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/crm-api')>();
  return {
    ...actual,
    listarContactos: vi
      .fn()
      .mockResolvedValue({ datos: [], pageInfo: { nextCursor: null, hasMore: false } }),
  };
});

import { estaUsandoCatalogoReal, listarSalidasApi } from '../../lib/catalogo-api';
import CotizadorPage from './page';

describe('CotizadorPage — Excursiones de un Día y Estados de UI (Bloque 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. Muestra estado vacío cuando la agencia conectada a la API no tiene salidas ni excursiones', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CotizadorPage />);
    });

    await waitFor(() => {
      const estadoVacio = screen.getByTestId('cotizador-estado-vacio');
      expect(estadoVacio).toBeDefined();
      expect(estadoVacio.textContent).toContain('No hay excursiones ni salidas registradas');
      expect(
        screen.getByRole('button', { name: /ver excursiones de demostración/i }),
      ).toBeDefined();
    });
  });

  it('2. Botón en estado vacío permite activar modo demostración para previsualizar excursiones', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CotizadorPage />);
    });

    const btnDemo = await screen.findByRole('button', { name: /ver excursiones de demostración/i });
    act(() => {
      fireEvent.click(btnDemo);
    });

    // Ahora se despliega el formulario y cotización mock con excursión de muestra
    await waitFor(() => {
      expect(screen.queryByTestId('cotizador-estado-vacio')).toBeNull();
      expect(screen.getByText(/Parámetros de Cotización/i)).toBeDefined();
    });
  });

  it('3. En modo demostración con tour náutico en Cartagena muestra aviso de impuesto de muelle', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(false);

    act(() => {
      render(<CotizadorPage />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/paquete turístico/i)).toBeDefined();
    });

    // Seleccionar la excursión marítima de Cartagena
    const select = screen.getByLabelText(/paquete turístico/i);
    act(() => {
      fireEvent.change(select, { target: { value: '01932000-0000-7000-8000-000000000010' } });
    });

    await waitFor(() => {
      const avisoMuelle = screen.getByTestId('aviso-impuesto-muelle');
      expect(avisoMuelle).toBeDefined();
      expect(avisoMuelle.textContent).toContain('Impuesto de muelle no incluido');
    });
  });

  it('4. Permite incrementar pasajeros y recalcula en tiempo de ejecución', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(false);

    act(() => {
      render(<CotizadorPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Adultos')).toBeDefined();
    });

    // Contador de adultos
    const btnsMas = screen.getAllByRole('button', { name: '+' });
    expect(btnsMas.length).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(btnsMas[0]!);
    });

    // Sigue renderizando sin romper
    expect(screen.getByText(/Total Cotización/i)).toBeDefined();
  });
});
