import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

let busqueda = '';
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(busqueda),
  usePathname: () => '/catalogo',
}));

vi.mock('../../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => true),
    listarSalidasApi: vi.fn(),
  };
});

import { estaUsandoCatalogoReal, listarSalidasApi } from '../../../lib/catalogo-api';
import { MOCK_PAQUETES_CATALOGO } from '../../../lib/mock-catalogo';
import CatalogoPage from './page';

describe('CatalogoPage — Explorar y Estado Sin Catálogo (T-018, T-019)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    busqueda = '';
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

  describe('?id= (T-318)', () => {
    const PAQUETE = MOCK_PAQUETES_CATALOGO[0]!;

    beforeEach(() => {
      vi.mocked(estaUsandoCatalogoReal).mockReturnValue(false);
      vi.mocked(listarSalidasApi).mockResolvedValue([]);
    });

    it('/catalogo?id=X abre la ficha del paquete X al montar', async () => {
      busqueda = `id=${PAQUETE.id}`;
      render(<CatalogoPage />);
      const ficha = await screen.findByRole('dialog', { name: /San Andrés/ });
      expect(ficha).toBeDefined();
      expect(screen.queryByTestId('catalogo-aviso-enlace')).toBeNull();
    });

    it('abrir un paquete hace push con su id (Atrás cierra la ficha)', async () => {
      render(<CatalogoPage />);
      fireEvent.click((await screen.findAllByRole('button', { name: /Ver tarifario/ }))[0]!);
      expect(push).toHaveBeenCalledWith(`/catalogo?id=${PAQUETE.id}`, { scroll: false });
    });

    it('cerrar la ficha abierta por enlace empuja /catalogo', async () => {
      busqueda = `id=${PAQUETE.id}`;
      render(<CatalogoPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Cerrar detalle' }));
      expect(push).toHaveBeenCalledWith('/catalogo', { scroll: false });
    });

    it('un UUID que no existe avisa con claridad y el catálogo sigue usable', async () => {
      busqueda = 'id=01932000-0000-7000-8000-00000000dead';
      render(<CatalogoPage />);
      expect((await screen.findByTestId('catalogo-aviso-enlace')).textContent).toMatch(
        /No encontramos el paquete/,
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getAllByRole('button', { name: /Ver tarifario/ }).length).toBeGreaterThan(0);
    });

    it('un valor que no es UUID avisa y no abre nada', async () => {
      busqueda = 'id=../../etc/passwd';
      render(<CatalogoPage />);
      expect((await screen.findByTestId('catalogo-aviso-enlace')).textContent).toMatch(/no apunta/);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
