import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CotizacionesPage from './page';
import * as cotizacionesApi from '../../lib/cotizaciones-api';
import type { PaginaDeCotizaciones, CotizacionGuardada } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cotizaciones',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('CotizacionesPage (Listado T-107)', () => {
  const mockPagina: PaginaDeCotizaciones = {
    datos: [
      {
        id: '01932000-0000-7000-8000-000000000001',
        contactoId: '00000000-0002-4000-8000-000000000001',
        oportunidadId: null,
        titulo: 'Cotización San Andrés Playa',
        estado: 'BORRADOR',
        versionEnviada: null,
        enviadaEn: null,
        creadaEn: '2026-10-25T10:00:00.000Z',
        numeroDeVersiones: 2,
        ultimaVersionEn: '2026-10-25T10:00:00.000Z',
        paqueteNombre: 'Escape San Andrés',
        fechaSalida: '2026-11-20',
        venta: { unidades: '5000000', moneda: 'COP' },
      },
    ],
    pageInfo: {
      hasMore: false,
      nextCursor: null,
    },
  };

  const mockCotizacionDetalle: CotizacionGuardada = {
    id: '01932000-0000-7000-8000-000000000001',
    contactoId: '00000000-0002-4000-8000-000000000001',
    oportunidadId: null,
    titulo: 'Cotización San Andrés Playa',
    estado: 'BORRADOR',
    versionEnviada: null,
    enviadaEn: null,
    creadaEn: '2026-10-25T10:00:00.000Z',
    actualizadaEn: '2026-10-25T10:00:00.000Z',
    versiones: [
      {
        id: '01932000-0000-7000-8000-000000000011',
        numero: 1,
        creadaEn: '2026-10-25T10:00:00.000Z',
        paqueteId: '01932000-0000-7000-8000-000000000001',
        paqueteNombre: 'Escape San Andrés',
        destino: 'San Andrés',
        noches: 4,
        fechaSalida: '2026-11-20',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-11-01',
        vigenciaHasta: '2026-11-30',
        deSalidaProgramada: true,
        adultos: 2,
        ninos: 0,
        infantes: 0,
        acomodacion: 'DOBLE',
        lineas: [],
        venta: { unidades: '5000000', moneda: 'COP' },
        vigenteHasta: null,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cotizacionesApi, 'listarCotizacionesApi').mockResolvedValue(mockPagina);
    vi.spyOn(cotizacionesApi, 'obtenerCotizacionGuardadaApi').mockResolvedValue(
      mockCotizacionDetalle,
    );
  });

  it('renderiza la lista de cotizaciones con estados y versiones', async () => {
    render(<CotizacionesPage />);

    await waitFor(() => {
      const titulos = screen.getAllByText('Cotización San Andrés Playa');
      expect(titulos.length).toBeGreaterThan(0);
      const versiones = screen.getAllByText('v2');
      expect(versiones.length).toBeGreaterThan(0);
    });

    // R10: Cero filtración de costos netos en la lista
    expect(screen.queryByText(/costo neto/i)).toBeNull();
    expect(screen.queryByText(/margen/i)).toBeNull();
  });

  it('abre el modal de WhatsApp al hacer clic en el botón WhatsApp de una fila', async () => {
    render(<CotizacionesPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Cotización San Andrés Playa').length).toBeGreaterThan(0);
    });

    const botonesWhatsApp = screen.getAllByTestId(
      'btn-enviar-whatsapp-01932000-0000-7000-8000-000000000001',
    );
    fireEvent.click(botonesWhatsApp[0]!);

    await waitFor(() => {
      expect(cotizacionesApi.obtenerCotizacionGuardadaApi).toHaveBeenCalledWith(
        '01932000-0000-7000-8000-000000000001',
      );
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(/Enviar Cotización por WhatsApp/i)).toBeDefined();
    });
  });

  it('duplica una cotización al hacer clic en Duplicar y la añade a la lista', async () => {
    const cotizacionDuplicada: CotizacionGuardada = {
      ...mockCotizacionDetalle,
      id: '01932000-0000-7000-8000-000000000099',
      titulo: 'Cotización San Andrés Playa (Copia)',
    };

    vi.spyOn(cotizacionesApi, 'duplicarCotizacionApi').mockResolvedValue(cotizacionDuplicada);

    render(<CotizacionesPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Cotización San Andrés Playa').length).toBeGreaterThan(0);
    });

    const botonesDuplicar = screen.getAllByTestId(
      'btn-duplicar-01932000-0000-7000-8000-000000000001',
    );
    fireEvent.click(botonesDuplicar[0]!);

    await waitFor(() => {
      expect(cotizacionesApi.duplicarCotizacionApi).toHaveBeenCalledWith(
        '01932000-0000-7000-8000-000000000001',
        'Cotización San Andrés Playa (Copia)',
      );
      expect(screen.getAllByText('Cotización San Andrés Playa (Copia)').length).toBeGreaterThan(0);
    });
  });
});
