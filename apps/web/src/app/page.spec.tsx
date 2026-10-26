import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}));

vi.mock('../lib/crm-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/crm-api')>();
  return {
    ...actual,
    consultarResumenInicioAsesor: vi.fn(),
  };
});

import { consultarResumenInicioAsesor, type ResumenInicioAsesor } from '../lib/crm-api';
import InicioPage from './page';

const mockResumenLleno: ResumenInicioAsesor = {
  conversaciones: {
    totalPendientes: 4,
    sinResponder: 2,
    ventanaCritica: 1,
    sinAsignar: 1,
    itemsUrgentes: [
      {
        id: 'conv-1',
        contactoNombre: 'Camila Rodriguez',
        contactoTelefono: '3001234567',
        ultimoMensaje: 'Hola, tienen disponibilidad para el tour a Guatapé este sábado?',
        instanteUltimoMensaje: '2026-10-26T18:00:00.000Z',
        esUrgente: true,
      },
      {
        id: 'conv-2',
        contactoNombre: 'Carlos Gomez',
        contactoTelefono: '3109876543',
        ultimoMensaje: 'Quisiera cotizar para 4 adultos y 2 niños.',
        instanteUltimoMensaje: '2026-10-26T17:30:00.000Z',
        esUrgente: false,
      },
    ],
  },
  pipeline: {
    totalOportunidades: 8,
    valorTotalCop: 45000000,
    etapas: [
      {
        id: 'etapa-1',
        nombre: 'Nuevo lead',
        color: '#0F766E',
        cantidad: 3,
        valorCop: 15000000,
      },
      {
        id: 'etapa-2',
        nombre: 'Cotización enviada',
        color: '#0284C7',
        cantidad: 5,
        valorCop: 30000000,
      },
    ],
    oportunidadesDestacadas: [
      {
        id: 'op-1',
        contactoNombre: 'Camila Rodriguez',
        etapaNombre: 'Cotización enviada',
        valorCop: 12000000,
      },
    ],
  },
  cotizaciones: {
    totalPorVencer: 2,
    enviadas: 3,
    borradores: 1,
    proximas: [
      {
        id: 'cot-1',
        titulo: 'Paquete Eje Cafetero 4D/3N',
        contactoId: 'ct-1',
        paqueteNombre: 'Eje Cafetero Mágico',
        fechaSalida: '2026-11-15T00:00:00.000Z',
        totalCop: 4200000,
        estado: 'ENVIADA',
        vigenteHasta: '2026-10-28T23:59:59.000Z',
        esCritica: true,
      },
      {
        id: 'cot-2',
        titulo: 'Excursión San Andrés 5D/4N',
        contactoId: 'ct-2',
        paqueteNombre: 'Caribe San Andrés',
        fechaSalida: '2026-12-01T00:00:00.000Z',
        totalCop: 8500000,
        estado: 'ENVIADA',
        vigenteHasta: '2026-11-02T23:59:59.000Z',
        esCritica: false,
      },
    ],
  },
};

const mockResumenVacio: ResumenInicioAsesor = {
  conversaciones: {
    totalPendientes: 0,
    sinResponder: 0,
    ventanaCritica: 0,
    sinAsignar: 0,
    itemsUrgentes: [],
  },
  pipeline: {
    totalOportunidades: 0,
    valorTotalCop: 0,
    etapas: [],
    oportunidadesDestacadas: [],
  },
  cotizaciones: {
    totalPorVencer: 0,
    enviadas: 0,
    borradores: 0,
    proximas: [],
  },
};

describe('InicioPage - Pantalla de Inicio del Asesor (T-020)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra estado de carga con skeletons al montar', () => {
    vi.mocked(consultarResumenInicioAsesor).mockReturnValue(new Promise(() => {})); // Never resolves
    render(<InicioPage />);

    expect(screen.getByTestId('inicio-cargando')).toBeDefined();
    expect(screen.queryByTestId('tarjeta-conversaciones')).toBeNull();
  });

  it('renderiza las tres tarjetas con datos reales y métricas', async () => {
    vi.mocked(consultarResumenInicioAsesor).mockResolvedValue(mockResumenLleno);
    render(<InicioPage />);

    await waitFor(() => {
      expect(screen.queryByTestId('inicio-cargando')).toBeNull();
    });

    // 1. Tarjeta Conversaciones
    const tarjetaConv = screen.getByTestId('tarjeta-conversaciones');
    expect(tarjetaConv).toBeDefined();
    expect(screen.getByTestId('badge-pendientes-total').textContent).toContain('4');
    expect(screen.getByText('Camila Rodriguez')).toBeDefined();
    expect(screen.getByText(/tour a Guatapé/)).toBeDefined();

    // Enlace con filtro aplicado hacia la bandeja
    const linkBandeja = screen.getByTestId('enlace-bandeja-filtrada');
    expect(linkBandeja.getAttribute('href')).toBe('/bandeja?filtro=sin-responder');

    // 2. Tarjeta Pipeline
    const tarjetaPipe = screen.getByTestId('tarjeta-pipeline');
    expect(tarjetaPipe).toBeDefined();
    expect(screen.getByTestId('badge-oportunidades-total').textContent).toContain('8');
    expect(screen.getByTestId('valor-total-pipeline').textContent).toContain('45.000.000');
    expect(screen.getByText('Nuevo lead')).toBeDefined();
    expect(screen.getByText('Cotización enviada')).toBeDefined();

    // Enlace hacia pipeline
    const linkPipeline = screen.getByTestId('enlace-pipeline-filtrado');
    expect(linkPipeline.getAttribute('href')).toBe('/pipeline');

    // 3. Tarjeta Cotizaciones
    const tarjetaCot = screen.getByTestId('tarjeta-cotizaciones');
    expect(tarjetaCot).toBeDefined();
    expect(screen.getByTestId('badge-cotizaciones-total').textContent).toContain('2');
    expect(screen.getByText('Paquete Eje Cafetero 4D/3N')).toBeDefined();
    expect(screen.getByText('Vence pronto')).toBeDefined();

    // Enlace con filtro aplicado hacia cotizaciones
    const linkCotizaciones = screen.getByTestId('enlace-cotizaciones-filtrada');
    expect(linkCotizaciones.getAttribute('href')).toBe('/cotizaciones?estado=ENVIADA');
  });

  it('muestra estados vacíos cuando la agencia no tiene ítems pendientes', async () => {
    vi.mocked(consultarResumenInicioAsesor).mockResolvedValue(mockResumenVacio);
    render(<InicioPage />);

    await waitFor(() => {
      expect(screen.queryByTestId('inicio-cargando')).toBeNull();
    });

    const vacios = screen.getAllByTestId('tarjeta-vacia');
    expect(vacios.length).toBe(3);
    expect(screen.getByText(/¡Al día! No tienes mensajes pendientes/)).toBeDefined();
    expect(screen.getByText(/No hay oportunidades activas/)).toBeDefined();
    expect(screen.getByText(/Sin cotizaciones próximas a vencer/)).toBeDefined();
  });

  it('muestra mensaje de error con botón de reintento si falla la API', async () => {
    vi.mocked(consultarResumenInicioAsesor)
      .mockRejectedValueOnce(new Error('Fallo de red al consultar microservicios'))
      .mockResolvedValueOnce(mockResumenLleno);

    render(<InicioPage />);

    await waitFor(() => {
      expect(screen.getByTestId('inicio-error')).toBeDefined();
    });
    expect(screen.getByText('Fallo de red al consultar microservicios')).toBeDefined();

    const botonReintentar = screen.getByTestId('boton-reintentar');
    expect(botonReintentar).toBeDefined();

    fireEvent.click(botonReintentar);

    await waitFor(() => {
      expect(screen.queryByTestId('inicio-error')).toBeNull();
      expect(screen.getByTestId('tarjeta-conversaciones')).toBeDefined();
    });
  });
});
