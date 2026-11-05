import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportesPage from './page';
import * as authApi from '../../lib/auth-api';
import * as reportesApi from '../../lib/reportes-api';
import type { ResumenDeReportes, SesionActual } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/reportes',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Asesor Comercial',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'Viajes El Sol',
      slug: 'viajes-el-sol',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000011',
    rol: 'Asesor Comercial',
    permisos: ['conversaciones.ver_todas'],
  },
};

const SESION_DUENO: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000002',
    correo: 'dueno@viajapro.com',
    nombre: 'Dueña Agencia',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'Viajes El Sol',
      slug: 'viajes-el-sol',
    },
  ],
  tenantActivoId: '01932000-0000-7000-8000-00000000000a',
  acceso: {
    usuarioId: '01932000-0000-7000-8000-000000000022',
    rol: 'Dueño',
    permisos: [
      'cotizacion.ver_neto_y_margen',
      'usuarios.administrar',
      'roles.administrar',
      'conversaciones.ver_todas',
    ],
  },
};

function fixtureDosMonedas(conMargen: boolean): ResumenDeReportes {
  return {
    periodo: { desde: '2026-10-05T05:00:00.000Z', hasta: '2026-11-04T05:00:00.000Z' },
    cotizaciones: { creadas: 4, enviadas: 3, aceptadas: 2, tasaAceptacion: 66.7 },
    ventasPorMoneda: [
      {
        moneda: 'COP',
        cotizacionesAceptadas: 1,
        ventas: { unidades: '9100000', moneda: 'COP' },
        ...(conMargen
          ? {
              neto: { unidades: '7000000', moneda: 'COP' },
              margen: { unidades: '2100000', moneda: 'COP' },
              margenPorcentaje: 23.1,
              cotizacionesSinNeto: 0,
            }
          : {}),
      },
      {
        moneda: 'USD',
        cotizacionesAceptadas: 1,
        ventas: { unidades: '125000', moneda: 'USD' },
        ...(conMargen
          ? {
              neto: { unidades: '100000', moneda: 'USD' },
              margen: { unidades: '25000', moneda: 'USD' },
              margenPorcentaje: 20.0,
              cotizacionesSinNeto: 0,
            }
          : {}),
      },
    ],
    oportunidades: {
      creadas: 5,
      ganadas: 2,
      perdidas: 1,
      abiertas: 2,
      tasaConversion: 66.7,
      porEtapa: [
        {
          etapaId: '01932000-0000-7000-8000-0000000000e1',
          nombre: 'Propuesta',
          orden: 1,
          esGanada: false,
          esPerdida: false,
          cantidad: 2,
        },
      ],
    },
    respuesta: {
      conversacionesNuevas: 10,
      conversacionesRespondidas: 8,
      promedioMinutos: 14.2,
      medianaMinutos: 8.5,
    },
  };
}

describe('ReportesPage - Permisos, dos monedas y GET /api/v1/reportes/resumen (T-142)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sin permiso cotizacion.ver_neto_y_margen: no muestra margen ni costo neto en dos monedas', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    const espia = vi
      .spyOn(reportesApi, 'obtenerResumenDeReportesApi')
      .mockResolvedValue(fixtureDosMonedas(false));

    render(<ReportesPage />);

    expect(await screen.findByText(/Reportes y Rendimiento Comercial/i)).toBeDefined();

    // Solo vista asesor, sin selector de rol de dueño
    expect(await screen.findByText(/Vista Asesor \(Operativa\)/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Vista Dueño/i })).toBeNull();

    // Las dos monedas se muestran de forma independiente
    expect(await screen.findByTestId('ventas-COP')).toBeDefined();
    expect(screen.getByTestId('ventas-USD')).toBeDefined();
    expect(screen.getByTestId('ventas-COP').textContent).toContain('9.100.000');
    expect(screen.getByTestId('ventas-USD').textContent).toContain('1.250,00');

    // Confidencial no está en el DOM
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Costo Neto Mayoristas:/i)).toBeNull();
    expect(screen.queryByText(/Margen Comercial/i)).toBeNull();

    expect(espia).toHaveBeenCalled();
  });

  it('con permiso cotizacion.ver_neto_y_margen y respuesta con margen: muestra sección confidencial con dos monedas', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(fixtureDosMonedas(true));

    render(<ReportesPage />);

    // El botón del conmutador de dueño está disponible y activo
    const btnDueno = await screen.findByRole('button', { name: /Vista Dueño/i });
    expect(btnDueno).toBeDefined();

    // Ambas monedas en ventas
    expect(await screen.findByTestId('ventas-COP')).toBeDefined();
    expect(screen.getByTestId('ventas-USD')).toBeDefined();

    // En la vista de dueño, el bloque confidencial existe con ambas monedas
    const seccionConfidencial = await screen.findByTestId('seccion-margen-confidencial');
    expect(seccionConfidencial).toBeDefined();
    expect(screen.getByTestId('margen-COP')).toBeDefined();
    expect(screen.getByTestId('margen-USD')).toBeDefined();

    expect(screen.getByText(/Utilidad Bruta y Margen Real/i)).toBeDefined();
    expect(screen.getAllByText(/Costo Neto Mayoristas:/i).length).toBe(2);
    expect(screen.getAllByText(/Margen Comercial:/i).length).toBe(2);
  });

  it('permite alternar a vista asesor ocultando el margen aunque el dueño tenga permiso', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(fixtureDosMonedas(true));

    render(<ReportesPage />);

    await screen.findByTestId('seccion-margen-confidencial');

    const btnAsesor = screen.getByRole('button', { name: /Vista Asesor/i });
    fireEvent.click(btnAsesor);

    // Al alternar voluntariamente a asesor, la sección confidencial desaparece
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Costo Neto Mayoristas:/i)).toBeNull();
  });

  it('el selector de periodo convierte a instantes UTC con la zona horaria de la agencia y filtra', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    const espia = vi
      .spyOn(reportesApi, 'obtenerResumenDeReportesApi')
      .mockResolvedValue(fixtureDosMonedas(false));

    // Reloj fijo: 2026-11-04T15:00:00Z (10:00 Bogotá)
    const relojFijo = () => new Date('2026-11-04T15:00:00.000Z');
    render(<ReportesPage ahora={relojFijo} />);

    await screen.findByTestId('kpi-ventas');

    // Primera llamada (ultimos_30_dias por defecto)
    expect(espia).toHaveBeenCalledWith(
      expect.objectContaining({
        desde: expect.any(String),
        hasta: expect.any(String),
      }),
      expect.any(AbortSignal),
    );

    // Cambiar periodo a 'este_mes'
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'este_mes' } });

    await waitFor(() => {
      // Debe haber llamado a la API con el inicio del mes en Bogotá (2026-11-01T05:00:00.000Z)
      const llamadaRango = espia.mock.calls.find((c) => c[0]?.desde === '2026-11-01T05:00:00.000Z');
      expect(llamadaRango).toBeDefined();
    });
  });

  it('muestra la mediana como cifra principal de respuesta y la cohorte explícita', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false),
    );

    render(<ReportesPage />);

    const kpiRespuesta = await screen.findByTestId('kpi-respuesta');
    expect(kpiRespuesta.textContent).toContain('Primera respuesta (mediana)');
    expect(kpiRespuesta.textContent).toContain('8,5 min');
    expect(kpiRespuesta.textContent).toContain('Promedio: 14,2 min');
    expect(kpiRespuesta.textContent).toContain(
      '8 de 10 conversaciones nuevas respondidas en el periodo',
    );

    const kpiCotizaciones = screen.getByTestId('kpi-cotizaciones');
    expect(kpiCotizaciones.textContent).toContain(
      '2 aceptadas de 3 enviadas en el periodo (4 creadas)',
    );

    const kpiOportunidades = screen.getByTestId('kpi-oportunidades');
    expect(kpiOportunidades.textContent).toContain(
      '5 creadas en el periodo (2 ganadas · 1 perdidas · 2 abiertas)',
    );
  });

  it('muestra alerta de sin permiso ante error 403 de la API', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockRejectedValue(
      new reportesApi.ErrorReportesApi('SIN_PERMISO', 'No tienes permiso.', 403),
    );

    render(<ReportesPage />);

    const alerta = await screen.findByTestId('reportes-sin-permiso');
    expect(alerta).toBeDefined();
    expect(alerta.textContent).toContain('No tienes permiso para ver los reportes');
  });
});
