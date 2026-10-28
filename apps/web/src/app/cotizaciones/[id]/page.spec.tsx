import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaCotizacionGuardada from './page';
import * as cotizacionesApi from '../../../lib/cotizaciones-api';
import * as authApi from '../../../lib/auth-api';
import * as crmApi from '../../../lib/crm-api';
import type { CotizacionGuardada, SesionActual } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '01932000-0000-7000-8000-000000000001' }),
  usePathname: () => '/cotizaciones/01932000-0000-7000-8000-000000000001',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('PaginaCotizacionGuardada (Detalle T-107)', () => {
  const cotizacionPrueba: CotizacionGuardada = {
    id: '01932000-0000-7000-8000-000000000001',
    contactoId: '00000000-0002-4000-8000-000000000001',
    oportunidadId: null,
    titulo: 'Cotización San Andrés Todo Incluido',
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
        paqueteNombre: 'Escape Caribeño San Andrés',
        destino: 'San Andrés',
        noches: 4,
        fechaSalida: '2026-11-10',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-11-01',
        vigenciaHasta: '2026-11-30',
        deSalidaProgramada: true,
        adultos: 2,
        ninos: 0,
        infantes: 0,
        acomodacion: 'DOBLE',
        lineas: [
          {
            tarifaId: '01932000-0000-7000-8000-000000000091',
            nombre: 'Adulto en acomodación DOBLE',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 2,
            precioUnitario: { unidades: '2500000', moneda: 'COP' },
            total: { unidades: '5000000', moneda: 'COP' },
            masBarata: false,
            margen: { unidades: '750000', moneda: 'COP' },
          },
        ],
        venta: { unidades: '5000000', moneda: 'COP' },
        vigenteHasta: '2026-10-31',
        neto: { unidades: '4250000', moneda: 'COP' },
        margen: { unidades: '750000', moneda: 'COP' },
        politica: {
          porcentaje: 17.6,
          base: 'SOBRE_EL_NETO',
          origenDeLaVenta: 'DERIVADA_DEL_NETO',
          redondeoVenta: 1000,
        },
      },
    ],
  };

  const sesionSinPermisoNeto: SesionActual = {
    identidad: {
      id: '01932000-0000-7000-8000-000000000002',
      correo: 'asesor@agencia.com',
      nombre: 'Asesor Comercial',
    },
    agencias: [
      {
        id: '01932000-0000-7000-8000-00000000000a',
        slug: 'agencia-demo',
        nombre: 'Agencia Demo',
      },
    ],
    tenantActivoId: '01932000-0000-7000-8000-00000000000a',
    acceso: {
      usuarioId: '01932000-0000-7000-8000-000000000002',
      rol: 'asesor',
      permisos: ['conversaciones.ver_todas'],
    },
  };

  const sesionConPermisoNeto: SesionActual = {
    identidad: {
      id: '01932000-0000-7000-8000-000000000001',
      correo: 'dueno@agencia.com',
      nombre: 'Dueño Agencia',
    },
    agencias: [
      {
        id: '01932000-0000-7000-8000-00000000000a',
        slug: 'agencia-demo',
        nombre: 'Agencia Demo',
      },
    ],
    tenantActivoId: '01932000-0000-7000-8000-00000000000a',
    acceso: {
      usuarioId: '01932000-0000-7000-8000-000000000001',
      rol: 'dueno',
      permisos: ['cotizacion.ver_neto_y_margen'],
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cotizacionesApi, 'obtenerCotizacionGuardadaApi').mockResolvedValue(cotizacionPrueba);
    vi.spyOn(crmApi, 'listarContactos').mockResolvedValue({
      datos: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it('oculta totalmente el panel de auditoría de margen y columnas de neto a quien no tiene el permiso (R10 / ADR-0011)', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.textContent).toContain('Cotización San Andrés Todo Incluido');
    });

    // Panel de auditoría de margen NO debe existir en el DOM
    expect(screen.queryByTestId('panel-auditoria-margen')).toBeNull();
    expect(screen.queryByText(/Auditoría de Margen/i)).toBeNull();
    expect(screen.queryByText(/Neto Unit\./i)).toBeNull();
    expect(screen.queryByText(/Margen Unit\./i)).toBeNull();
  });

  it('muestra el panel de auditoría de margen y desglose a usuarios con permiso cotizacion.ver_neto_y_margen', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionConPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('panel-auditoria-margen')).toBeDefined();
      expect(screen.getByText(/Auditoría de Margen \(ADR-0011\)/i)).toBeDefined();
      expect(screen.getByText(/Neto Unit\./i)).toBeDefined();
      expect(screen.getByText(/Margen Unit\./i)).toBeDefined();
    });
  });

  it('abre el modal de WhatsApp al hacer clic en Enviar por WhatsApp', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-abrir-modal-whatsapp')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-abrir-modal-whatsapp'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText(/Enviar Cotización por WhatsApp/i)).toBeDefined();
    });
  });

  it('duplica la versión actual creando la versión 2 al hacer clic en Duplicar versión', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(sesionSinPermisoNeto);

    const cotizacionConV2: CotizacionGuardada = {
      ...cotizacionPrueba,
      versiones: [
        cotizacionPrueba.versiones[0]!,
        {
          ...cotizacionPrueba.versiones[0]!,
          id: '01932000-0000-7000-8000-000000000012',
          numero: 2,
        },
      ],
    };

    vi.spyOn(cotizacionesApi, 'duplicarVersionCotizacionApi').mockResolvedValue(cotizacionConV2);

    render(<PaginaCotizacionGuardada />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-duplicar-version')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-duplicar-version'));

    await waitFor(() => {
      expect(cotizacionesApi.duplicarVersionCotizacionApi).toHaveBeenCalledWith(
        '01932000-0000-7000-8000-000000000001',
        1,
      );
      expect(screen.getAllByText('Versión 2').length).toBeGreaterThan(0);
    });
  });
});
