import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { SalidaPublicada } from '@viajapro/contracts';

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

describe('CatalogoPage — Estado vacío «sin catálogo todavía» (T-019)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('1. Con un tenant sin productos, muestra el estado vacío con Importar catálogo y Crear excursión', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      const estadoVacio = screen.getByTestId('catalogo-estado-vacio');
      expect(estadoVacio).toBeDefined();
      expect(estadoVacio.textContent).toContain('No hay excursiones ni salidas registradas');

      const btnImportar = screen.getByTestId('accion-importar-catalogo');
      const btnCrear = screen.getByTestId('accion-crear-excursion');
      expect(btnImportar).toBeDefined();
      expect(btnImportar.textContent).toContain('Importar catálogo');
      expect(btnCrear).toBeDefined();
      expect(btnCrear.textContent).toContain('Crear excursión');
    });
  });

  it('2. Al hacer clic en las acciones del estado vacío muestra avisos accesibles al asesor', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CatalogoPage />);
    });

    const btnImportar = await screen.findByTestId('accion-importar-catalogo');
    act(() => {
      fireEvent.click(btnImportar);
    });

    await waitFor(() => {
      const aviso = screen.getByTestId('aviso-accion-catalogo');
      expect(aviso.textContent).toContain('carga masiva de excursiones desde archivo Excel o CSV');
    });

    const btnCrear = screen.getByTestId('accion-crear-excursion');
    act(() => {
      fireEvent.click(btnCrear);
    });

    await waitFor(() => {
      const aviso = screen.getByTestId('aviso-accion-catalogo');
      expect(aviso.textContent).toContain('alta manual de excursiones');
    });
  });

  it('3. El botón de ver excursiones de demostración permite alternar a datos simulados', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CatalogoPage />);
    });

    const btnDemo = await screen.findByTestId('accion-ver-demo');
    act(() => {
      fireEvent.click(btnDemo);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('catalogo-estado-vacio')).toBeNull();
      expect(screen.getByText('Catálogo de Paquetes y Tarifarios')).toBeDefined();
    });
  });

  it('4. Cuando el catálogo sí tiene salidas reales, no muestra el estado vacío y renderiza las tarjetas', async () => {
    const salidaMuestra: SalidaPublicada = {
      vigenciaId: 'v-101',
      paqueteId: 'p-101',
      paqueteNombre: 'Tour Islas del Rosario',
      destino: 'Cartagena',
      noches: 0,
      fecha: '2026-10-15',
      cupoTotal: 20,
      tarifas: 1,
      desde: { unidades: '250000', moneda: 'COP' },
      desdeEsDeGrupo: false,
    };

    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([salidaMuestra]);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('catalogo-estado-vacio')).toBeNull();
      expect(screen.getByText('Tour Islas del Rosario')).toBeDefined();
    });
  });
});
