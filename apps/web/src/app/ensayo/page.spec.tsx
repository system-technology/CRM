import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EnsayoJornadaPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ensayo',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../../lib/modo-demo', () => ({
  esModoDemo: () => false,
  useModoDemo: () => ({
    esDemo: false,
    alternarDemo: vi.fn(),
    desactivarDemo: vi.fn(),
  }),
}));

const UUID_BASE = '11111111-1111-4111-8111-11111111111';

function crearFilaCotizacionEnviada(indice: number) {
  return {
    id: `${UUID_BASE}${String(indice)}`,
    contactoId: '22222222-2222-4222-8222-222222222222',
    oportunidadId: null,
    titulo: `Cotización San Andrés #${String(indice)}`,
    estado: 'ENVIADA',
    versionEnviada: 1,
    enviadaEn: '2026-10-29T12:00:00.000Z',
    creadaEn: '2026-10-29T11:30:00.000Z',
    ultimaVersionEn: '2026-10-29T11:45:00.000Z',
    numeroDeVersiones: 1,
    paqueteNombre: 'San Andrés Todo Incluido',
    fechaSalida: '2026-12-10',
    venta: { unidades: '3800000', moneda: 'COP' },
  };
}

function crearSeguimientoFechado(indice: number) {
  return {
    id: `33333333-3333-4333-8333-33333333333${String(indice)}`,
    descripcion: `Confirmar tiquetes #${String(indice)}`,
    venceEn: '2026-10-30T15:00:00.000Z',
    completadoEn: null,
    asesorId: null,
    asesorNombre: 'Laura Méndez',
    contactoId: '22222222-2222-4222-8222-222222222222',
    contactoNombre: 'Valeria Gómez',
    oportunidadId: null,
    oportunidadTitulo: null,
    conversacionId: '44444444-4444-4444-8444-444444444444',
  };
}

describe('EnsayoJornadaPage (/ensayo) — T-115', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra la marca verde de Fase 1 cuando la API real devuelve >=20 conversaciones, >=5 cotizaciones enviadas y seguimientos fechados', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/conversaciones/contadores')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              todas: 24,
              mias: 12,
              sinAsignar: 0,
              conversacionesSinLeer: 0,
              mensajesSinLeer: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.includes('/api/v1/cotizaciones')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              datos: [
                crearFilaCotizacionEnviada(1),
                crearFilaCotizacionEnviada(2),
                crearFilaCotizacionEnviada(3),
                crearFilaCotizacionEnviada(4),
                crearFilaCotizacionEnviada(5),
              ],
              pageInfo: { nextCursor: null, hasMore: false },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (url.includes('/api/v1/crm/seguimientos')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              datos: [crearSeguimientoFechado(1), crearSeguimientoFechado(2)],
              pageInfo: { nextCursor: null, hasMore: false },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });

    render(<EnsayoJornadaPage />);

    await waitFor(() => {
      expect(screen.getByTestId('marca-verde-fase-1')).toBeDefined();
    });

    expect(screen.getByTestId('insignia-modo-real-ensayo')).toBeDefined();
    expect(screen.getByTestId('valor-conversaciones').textContent).toBe('24');
    expect(screen.getByTestId('valor-cotizaciones').textContent).toBe('5');
    expect(screen.getByTestId('valor-seguimientos').textContent).toBe('2');
    expect(screen.getByTestId('check-conversaciones')).toBeDefined();
    expect(screen.getByTestId('check-cotizaciones')).toBeDefined();
    expect(screen.getByTestId('check-seguimientos')).toBeDefined();
  });

  it('mantiene los contadores en 0 sin inyectar datos de demostración cuando el servidor no responde en modo real', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    render(<EnsayoJornadaPage />);

    await waitFor(() => {
      expect(screen.getByTestId('aviso-red-ensayo')).toBeDefined();
    });

    expect(screen.getByTestId('estado-pendiente-fase-1')).toBeDefined();
    expect(screen.queryByTestId('marca-verde-fase-1')).toBeNull();
    expect(screen.getByTestId('valor-conversaciones').textContent).toBe('0');
    expect(screen.getByTestId('valor-cotizaciones').textContent).toBe('0');
    expect(screen.getByTestId('valor-seguimientos').textContent).toBe('0');
  });
});
