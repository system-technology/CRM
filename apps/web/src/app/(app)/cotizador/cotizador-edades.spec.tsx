import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({
    get: vi.fn((key: string) => (key === 'paqueteId' ? 'paq-101' : null)),
  }),
  usePathname: () => '/cotizador',
}));

vi.mock('../../../lib/catalogo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/catalogo-api')>();
  return {
    ...actual,
    estaUsandoCatalogoReal: vi.fn(() => true),
    listarSalidasApi: vi.fn(),
    cotizarSalidaApi: vi.fn(),
    obtenerOpcionesDeSalidaApi: vi.fn(),
  };
});

vi.mock('../../../lib/crm-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/crm-api')>();
  return {
    ...actual,
    listarContactos: vi
      .fn()
      .mockResolvedValue({ datos: [], pageInfo: { nextCursor: null, hasMore: false } }),
  };
});

import {
  estaUsandoCatalogoReal,
  listarSalidasApi,
  cotizarSalidaApi,
  obtenerOpcionesDeSalidaApi,
} from '../../../lib/catalogo-api';
import CotizadorPage from './page';

const cotizacion = {
  vigenciaId: 'vig-101',
  paqueteId: 'paq-101',
  paqueteNombre: 'Puebleando',
  destino: 'Quindío',
  noches: 1,
  deSalidaProgramada: true,
  fecha: '2026-10-03',
  vigenciaDesde: '2026-10-03',
  vigenciaHasta: '2026-10-03',
  pasajeros: 3,
  adultos: 2,
  ninos: 1,
  infantes: 0,
  pideComposicion: true,
  total: { unidades: '1070000', moneda: 'COP' as const },
  lineas: [],
  alternativas: [],
  noAplicables: [],
  suplementos: [],
};

describe('Cotizador: edad de cada niño e infante (T-179)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(estaUsandoCatalogoReal).mockReturnValue(true);
    vi.mocked(listarSalidasApi).mockResolvedValue([
      {
        vigenciaId: 'vig-101',
        paqueteId: 'paq-101',
        paqueteNombre: 'Puebleando',
        destino: 'Quindío',
        noches: 1,
        fecha: '2026-10-03',
        cupoTotal: 8,
        desde: { unidades: '389000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
    ]);
    vi.mocked(obtenerOpcionesDeSalidaApi).mockResolvedValue([]);
    vi.mocked(cotizarSalidaApi).mockResolvedValue(cotizacion);
  });

  it('sin niños no pide edades', async () => {
    render(<CotizadorPage />);
    await screen.findByRole('button', { name: /aumentar niños/i });
    expect(screen.queryByRole('group', { name: /edades de los pasajeros menores/i })).toBeNull();
  });

  it('al añadir un niño pide su edad y la envía en la petición', async () => {
    render(<CotizadorPage />);
    fireEvent.click(await screen.findByRole('button', { name: /aumentar niños/i }));

    const campo = await screen.findByLabelText(/edad del niño 1/i);
    fireEvent.change(campo, { target: { value: '7' } });

    await waitFor(() => {
      expect(cotizarSalidaApi).toHaveBeenLastCalledWith(
        expect.objectContaining({ adultos: 2, ninos: 1, edadesNinos: [7] }),
      );
    });
  });

  it('con la edad sin responder NO envía edades inventadas', async () => {
    render(<CotizadorPage />);
    fireEvent.click(await screen.findByRole('button', { name: /aumentar niños/i }));
    await screen.findByLabelText(/edad del niño 1/i);

    await waitFor(() => {
      expect(cotizarSalidaApi).toHaveBeenCalledWith(expect.objectContaining({ ninos: 1 }));
    });
    const ultima = vi.mocked(cotizarSalidaApi).mock.calls.at(-1)?.[0];
    expect(ultima).not.toHaveProperty('edadesNinos');
  });

  it('un infante pide si ocupa silla y lo envía como conteo', async () => {
    render(<CotizadorPage />);
    fireEvent.click(await screen.findByRole('button', { name: /aumentar infantes/i }));

    fireEvent.click(await screen.findByLabelText(/el infante 1 ocupa silla propia/i));

    await waitFor(() => {
      expect(cotizarSalidaApi).toHaveBeenLastCalledWith(
        expect.objectContaining({ infantes: 1, infantesConSilla: 1 }),
      );
    });
  });
});
