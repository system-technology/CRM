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
  usePathname: () => '/catalogo',
}));

vi.mock('../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => true),
    listarSalidasApi: vi.fn(),
  };
});

import { estaUsandoCatalogoReal, listarSalidasApi } from '../../lib/catalogo-api';
import CatalogoPage from './page';

describe('CatalogoPage — Explorar y Estado Sin Catálogo (T-018, T-019)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. Muestra estado sin catálogo (T-019) cuando la agencia no tiene salidas ni productos en la API', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      const estadoVacio = screen.getByTestId('estado-sin-catalogo');
      expect(estadoVacio).toBeDefined();
      expect(screen.getByTestId('btn-sin-catalogo-importar')).toBeDefined();
      expect(screen.getByTestId('btn-sin-catalogo-crear')).toBeDefined();
    });
  });

  it('2. Al hacer clic en Importar catálogo se abre el asistente de importación (T-019 / T-029)', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CatalogoPage />);
    });

    const btnImportar = await screen.findByTestId('btn-sin-catalogo-importar');
    act(() => {
      fireEvent.click(btnImportar);
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(/Asistente de Importación/i)).toBeDefined();
    });
  });

  it('3. Muestra tarjetas de salidas publicadas cuando la API entrega datos (T-018)', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([
      {
        vigenciaId: 'vig-101',
        paqueteId: 'paq-101',
        paqueteNombre: 'Tour Islas del Rosario VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-03',
        cupoTotal: 4,
        desde: { unidades: '180000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
    ]);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Tour Islas del Rosario VIP')).toBeDefined();
      expect(screen.getByTestId('chip-cupos-salida')).toBeDefined();
      expect(screen.getByTestId('tarjeta-salida-publicada')).toBeDefined();
    });
  });
});
