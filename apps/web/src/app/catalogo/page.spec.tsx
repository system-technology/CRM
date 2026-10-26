import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/catalogo',
}));

vi.mock('../../lib/catalogo-api', () => ({
  estaUsandoCatalogoReal: vi.fn(),
  listarSalidasApi: vi.fn(),
  obtenerBaseApi: vi.fn(() => 'http://localhost:3333'),
  obtenerTenantDemo: vi.fn(() => 'tenant-test'),
}));

vi.mock('../../lib/modo-demo', () => ({
  useModoDemo: vi.fn(() => ({ esDemo: false })),
  esModoDemo: vi.fn(() => false),
  alternarModoDemo: vi.fn(),
  fijarModoDemo: vi.fn(),
}));

import CatalogoPage from './page';
import { estaUsandoCatalogoReal, listarSalidasApi } from '../../lib/catalogo-api';
import type { SalidaPublicada } from '@viajapro/contracts';

const SALIDAS_MOCK_API: SalidaPublicada[] = [
  {
    vigenciaId: 'v-rosario-1',
    paqueteId: 'pkg-rosario-01',
    paqueteNombre: 'Pasadía Islas del Rosario & Barú VIP',
    destino: 'Cartagena',
    noches: 0,
    fecha: '2026-10-03',
    cupoTotal: 14,
    desde: { unidades: '250000', moneda: 'COP' },
    desdeEsDeGrupo: false,
    tarifas: 2,
  },
  {
    vigenciaId: 'v-rosario-2',
    paqueteId: 'pkg-rosario-01',
    paqueteNombre: 'Pasadía Islas del Rosario & Barú VIP',
    destino: 'Cartagena',
    noches: 0,
    fecha: '2026-10-04',
    cupoTotal: 4,
    desde: { unidades: '250000', moneda: 'COP' },
    desdeEsDeGrupo: false,
    tarifas: 2,
  },
  {
    vigenciaId: 'v-quindio-1',
    paqueteId: 'pkg-quindio-01',
    paqueteNombre: 'Puebleando en el Quindío',
    destino: 'Eje Cafetero',
    noches: 2,
    fecha: '2026-10-12',
    cupoTotal: 18,
    desde: { unidades: '410000', moneda: 'COP' },
    desdeEsDeGrupo: false,
    tarifas: 1,
  },
];

describe('CatalogoPage — T-018: Tarjeta y ficha de excursión en catálogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renderiza productos agrupados desde la API con tarjetas ricas, horario y aviso de muelle', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue(SALIDAS_MOCK_API);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('Pasadía Islas del Rosario & Barú VIP')).toBeDefined();
      expect(screen.getByText('Puebleando en el Quindío')).toBeDefined();
      expect(screen.getByTestId('aviso-impuesto-muelle-catalogo')).toBeDefined();
    });
  });

  it('2. Las salidas de cada producto se muestran como chips con cupos disponibles y últimos cupos', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue(SALIDAS_MOCK_API);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      const chips = screen.getAllByTestId('chip-salida');
      expect(chips.length).toBeGreaterThanOrEqual(3);
      expect(screen.getByText(/14 cupos/i)).toBeDefined();
      expect(screen.getByText(/quedan 4/i)).toBeDefined();
    });
  });

  it('3. Al hacer clic en "Ver ficha", abre el modal con detalle completo e inclusiones', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue(SALIDAS_MOCK_API);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /ver ficha/i })[0]).toBeDefined();
    });

    const btnFicha = screen.getAllByRole('button', { name: /ver ficha/i })[0]!;
    act(() => {
      fireEvent.click(btnFicha);
    });

    await waitFor(() => {
      expect(screen.getByTestId('modal-ficha-excursion')).toBeDefined();
      expect(screen.getByRole('button', { name: /copiar propuesta rápida/i })).toBeDefined();
    });
  });

  it('4. Muestra estado vacío cuando la API devuelve 0 salidas', async () => {
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([]);

    act(() => {
      render(<CatalogoPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('catalogo-estado-vacio')).toBeDefined();
      expect(screen.getByText(/no se encontraron excursiones/i)).toBeDefined();
    });
  });
});
