import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportesReales } from './reportes-reales';
import * as api from '../../lib/reportes-api';
import type { ResumenDeReportes } from '@viajapro/contracts';

vi.mock('../../lib/crm-api', () => ({
  obtenerTableroPipeline: () => Promise.resolve({ columnas: [] }),
}));

const ETAPA = '01932000-0000-7000-8000-0000000000e1';

function base(extra: Partial<ResumenDeReportes> = {}): ResumenDeReportes {
  return {
    periodo: { desde: '2026-10-05T05:00:00.000Z', hasta: '2026-11-04T05:00:00.000Z' },
    cotizaciones: { creadas: 4, enviadas: 3, aceptadas: 1, tasaAceptacion: 33.3 },
    ventasPorMoneda: [
      {
        moneda: 'COP',
        cotizacionesAceptadas: 1,
        ventas: { unidades: '9100000', moneda: 'COP' },
      },
      {
        moneda: 'USD',
        cotizacionesAceptadas: 1,
        ventas: { unidades: '125000', moneda: 'USD' },
      },
    ],
    oportunidades: {
      creadas: 5,
      ganadas: 0,
      perdidas: 0,
      abiertas: 5,
      tasaConversion: null,
      porEtapa: [
        {
          etapaId: ETAPA,
          nombre: 'Nuevo',
          orden: 1,
          esGanada: false,
          esPerdida: false,
          cantidad: 5,
        },
      ],
    },
    respuesta: {
      conversacionesNuevas: 6,
      conversacionesRespondidas: 0,
      promedioMinutos: null,
      medianaMinutos: null,
    },
    ...extra,
  };
}

describe('ReportesReales', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra el esqueleto mientras carga', () => {
    vi.spyOn(api, 'obtenerResumenDeReportesApi').mockReturnValue(new Promise(() => undefined));
    render(<ReportesReales periodo="este_mes" esDueno puedeVerNetoYMargen={false} />);
    expect(screen.getByLabelText(/Cargando reportes comerciales/i)).toBeDefined();
  });

  it('pide el rango en instantes UTC con la zona de la agencia', async () => {
    const espia = vi.spyOn(api, 'obtenerResumenDeReportesApi').mockResolvedValue(base());
    render(
      <ReportesReales
        periodo="este_mes"
        esDueno={false}
        puedeVerNetoYMargen={false}
        ahora={() => new Date('2026-11-04T03:00:00.000Z')}
      />,
    );
    await screen.findByTestId('reportes-reales');
    expect(espia.mock.calls[0]?.[0]).toEqual({
      desde: '2026-11-01T05:00:00.000Z',
      hasta: '2026-11-04T05:00:00.000Z',
    });
  });

  it('una fila por moneda, razones null como «Aún sin datos» y sin margen sin permiso', async () => {
    vi.spyOn(api, 'obtenerResumenDeReportesApi').mockResolvedValue(base());
    render(<ReportesReales periodo="este_mes" esDueno={false} puedeVerNetoYMargen={false} />);
    await screen.findByTestId('reportes-reales');
    expect(screen.getByTestId('ventas-COP').textContent).toContain('9.100.000');
    expect(screen.getByTestId('ventas-USD').textContent).toContain('1.250,00');
    expect(screen.getByTestId('kpi-oportunidades').textContent).toContain('Aún sin datos');
    expect(screen.getByTestId('kpi-respuesta').textContent).toContain('Aún sin datos');
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Costo neto/i)).toBeNull();
  });

  it('con permiso y claves del servidor, muestra el margen por moneda', async () => {
    vi.spyOn(api, 'obtenerResumenDeReportesApi').mockResolvedValue(
      base({
        ventasPorMoneda: [
          {
            moneda: 'COP',
            cotizacionesAceptadas: 1,
            ventas: { unidades: '10000000', moneda: 'COP' },
            neto: { unidades: '8000000', moneda: 'COP' },
            margen: { unidades: '2000000', moneda: 'COP' },
            margenPorcentaje: 20,
            cotizacionesSinNeto: 0,
          },
        ],
      }),
    );
    render(<ReportesReales periodo="este_mes" esDueno puedeVerNetoYMargen />);
    const fila = await screen.findByTestId('margen-COP');
    expect(fila.textContent).toContain('2.000.000');
    expect(fila.textContent).toContain('20 %');
  });

  it('sin actividad: estado vacío', async () => {
    vi.spyOn(api, 'obtenerResumenDeReportesApi').mockResolvedValue(
      base({
        cotizaciones: { creadas: 0, enviadas: 0, aceptadas: 0, tasaAceptacion: null },
        ventasPorMoneda: [],
        oportunidades: {
          creadas: 0,
          ganadas: 0,
          perdidas: 0,
          abiertas: 0,
          tasaConversion: null,
          porEtapa: [],
        },
        respuesta: {
          conversacionesNuevas: 0,
          conversacionesRespondidas: 0,
          promedioMinutos: null,
          medianaMinutos: null,
        },
      }),
    );
    render(<ReportesReales periodo="este_mes" esDueno={false} puedeVerNetoYMargen={false} />);
    await screen.findByTestId('reportes-vacio');
  });

  it('403: «no tienes permiso»', async () => {
    vi.spyOn(api, 'obtenerResumenDeReportesApi').mockRejectedValue(
      new api.ErrorReportesApi('PERMISO_DENEGADO', 'x', 403),
    );
    render(<ReportesReales periodo="este_mes" esDueno={false} puedeVerNetoYMargen={false} />);
    await screen.findByTestId('reportes-sin-permiso');
  });

  it('error: dice qué pasó y permite reintentar', async () => {
    const espia = vi
      .spyOn(api, 'obtenerResumenDeReportesApi')
      .mockRejectedValueOnce(new api.ErrorReportesApi('ERROR_CONEXION', 'Sin conexión.'))
      .mockResolvedValue(base());
    render(<ReportesReales periodo="este_mes" esDueno={false} puedeVerNetoYMargen={false} />);
    await screen.findByTestId('reportes-error');
    expect(screen.getByText('Sin conexión.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    await waitFor(() => expect(screen.getByTestId('reportes-reales')).toBeDefined());
    expect(espia).toHaveBeenCalled();
  });
});
