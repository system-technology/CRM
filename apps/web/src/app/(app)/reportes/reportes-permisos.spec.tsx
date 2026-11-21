import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportesPage from './page';
import * as crmApi from '../../../lib/crm-api';
import * as authApi from '../../../lib/auth-api';
import * as reportesApi from '../../../lib/reportes-api';
import type { ResumenDeReportes, SesionActual } from '@viajapro/contracts';

let busqueda = '';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/reportes',
  useRouter: () => ({
    push: vi.fn(),
    replace,
  }),
  useSearchParams: () => new URLSearchParams(busqueda),
}));

// El dashboard de administración (T-344) tiene sus propias pruebas; aquí solo se comprueba CUÁNDO
// y CON QUÉ se monta, sin que salga a la red.
vi.mock('../../../components/dashboard-admin/dashboard-admin', () => ({
  DashboardAdmin: (p: { periodo?: string; zona?: string; bloques?: readonly string[] }) => (
    <div
      data-testid="dashboard-admin-montado"
      data-periodo={p.periodo}
      data-zona={p.zona}
      data-bloques={p.bloques?.join(',')}
    />
  ),
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
      'reportes.ver_agencia',
    ],
  },
};

const ASESOR_ID = '01932000-0000-7000-8000-000000000011';

/** Lo que la API devuelve según el alcance: la web pinta esto, no deduce nada del permiso. */
function fixtureDosMonedas(
  conMargen: boolean,
  alcance: 'AGENCIA' | 'PROPIO' = 'AGENCIA',
): ResumenDeReportes {
  const f = fixtureAgencia(conMargen);
  return alcance === 'PROPIO' ? { ...f, alcance: 'PROPIO', asesorId: ASESOR_ID } : f;
}

function fixtureAgencia(conMargen: boolean): Extract<ResumenDeReportes, { alcance: 'AGENCIA' }> {
  return {
    alcance: 'AGENCIA' as const,
    asesorId: null,
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

describe('ReportesPage: la vista la decide la respuesta (T-343, ADR-0035 §5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    busqueda = '';
    replace.mockClear();
    vi.spyOn(crmApi, 'obtenerPendientesDelDiaApi').mockResolvedValue({
      vencidos: [{ id: 'a' }, { id: 'b' }],
      deHoy: [{ id: 'c' }],
    } as never);
  });

  it('respuesta PROPIO: titula «Mis números», sin filtro de agencia ni vista de administración', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    const espia = vi
      .spyOn(reportesApi, 'obtenerResumenDeReportesApi')
      .mockResolvedValue(fixtureDosMonedas(false, 'PROPIO'));

    render(<ReportesPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Mis números' })).toBeDefined();
    expect(await screen.findByTestId('mis-numeros')).toBeDefined();
    // Dinero por moneda, sin convertir ni sumar (R8).
    expect(screen.getByTestId('mn-ventas-COP').textContent).toContain('9.100.000');
    expect(screen.getByTestId('mn-ventas-USD').textContent).toContain('1.250,00');
    // Nada de agencia: ni conmutador, ni filtro, ni los KPI de administración.
    expect(screen.queryByRole('button', { name: /Vista (Dueño|Asesor)/i })).toBeNull();
    expect(screen.queryByTestId('reportes-ambito')).toBeNull();
    expect(screen.queryByTestId('kpi-ventas')).toBeNull();
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Margen/i)).toBeNull();
    // Sus seguimientos salen de la API (`yo`).
    expect(screen.getByTestId('mn-seguimientos-vencidos').textContent).toContain('2');
    expect(screen.getByTestId('mn-seguimientos-hoy').textContent).toContain('1');
    expect(espia).toHaveBeenCalled();
  });

  it('n < 20: la fracción «2 de 3», nunca un porcentaje', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false, 'PROPIO'),
    );
    render(<ReportesPage />);
    const tasa = await screen.findByTestId('mn-tasa-aceptacion');
    expect(tasa.textContent).toBe('2 de 3');
    expect(tasa.textContent).not.toContain('%');
  });

  it('respuesta AGENCIA con margen: «Reportes de la agencia», filtro y sección de margen sin conmutador', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(fixtureDosMonedas(true));

    render(<ReportesPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reportes de la agencia' }),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: /Vista (Dueño|Asesor)/i })).toBeNull();
    expect(await screen.findByTestId('ventas-COP')).toBeDefined();
    expect(screen.getByTestId('ventas-USD')).toBeDefined();
    expect(await screen.findByTestId('seccion-margen-confidencial')).toBeDefined();
    expect(screen.getByTestId('margen-COP')).toBeDefined();
    expect(screen.getByTestId('margen-USD')).toBeDefined();
    expect(screen.getAllByText(/Costo Neto Mayoristas:/i).length).toBe(2);
    expect(screen.getByTestId('reportes-ambito')).toBeDefined();
  });

  it('respuesta AGENCIA sin las claves de margen: la sección no existe (la API no las calculó)', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false),
    );
    render(<ReportesPage />);
    await screen.findByTestId('kpi-ventas');
    expect(screen.queryByTestId('seccion-margen-confidencial')).toBeNull();
    expect(screen.queryByText(/Costo Neto Mayoristas:/i)).toBeNull();
  });

  it('«Míos» vuelve a pedir el resumen con asesorId=yo', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    const espia = vi
      .spyOn(reportesApi, 'obtenerResumenDeReportesApi')
      .mockResolvedValue(fixtureDosMonedas(false));
    render(<ReportesPage />);
    const filtro = await screen.findByTestId('reportes-ambito');
    fireEvent.change(filtro, { target: { value: 'yo' } });
    await waitFor(() => {
      expect(
        espia.mock.calls.some(
          (c) => (c[2] as { asesorId?: string } | undefined)?.asesorId === 'yo',
        ),
      ).toBe(true);
    });
  });

  it('el periodo por defecto es el mes calendario en la zona de la agencia, con comparación', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    const espia = vi
      .spyOn(reportesApi, 'obtenerResumenDeReportesApi')
      .mockResolvedValue(fixtureDosMonedas(false, 'PROPIO'));

    // Reloj fijo: 2026-11-04T15:00:00Z (10:00 Bogotá)
    render(<ReportesPage ahora={() => new Date('2026-11-04T15:00:00.000Z')} />);
    await screen.findByTestId('mis-numeros');

    // Mes en curso: del 1 de noviembre (05:00 UTC) al final del día 4.
    expect(espia.mock.calls.some((c) => c[0]?.desde === '2026-11-01T05:00:00.000Z')).toBe(true);
    // Periodo anterior del mismo largo (4 días): del 28 de octubre al 1 de noviembre.
    expect(espia.mock.calls.some((c) => c[0]?.desde === '2026-10-28T05:00:00.000Z')).toBe(true);

    fireEvent.change(screen.getByLabelText('Periodo'), { target: { value: 'trimestre' } });
    await waitFor(() => {
      expect(espia.mock.calls.some((c) => c[0]?.desde === '2026-08-07T05:00:00.000Z')).toBe(true);
    });
  });

  it('usa la zona horaria de la agencia (GET /agencia/ajustes) para los límites y el subtítulo', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerZonaHorariaAgenciaApi').mockResolvedValue('Europe/Madrid');
    const espia = vi
      .spyOn(reportesApi, 'obtenerResumenDeReportesApi')
      .mockResolvedValue(fixtureDosMonedas(false, 'PROPIO'));

    render(<ReportesPage ahora={() => new Date('2026-11-04T15:00:00.000Z')} />);
    await screen.findByTestId('mis-numeros');

    expect(espia.mock.calls.some((c) => c[0]?.desde === '2026-10-31T23:00:00.000Z')).toBe(true);
    expect(screen.getByText(/zona horaria: Europe\/Madrid/)).toBeDefined();
  });

  it('si la zona de la agencia no se puede leer, usa America/Bogota sin romper', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerZonaHorariaAgenciaApi').mockResolvedValue(null);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false, 'PROPIO'),
    );
    render(<ReportesPage />);
    await screen.findByTestId('mis-numeros');
    expect(screen.getByText(/zona horaria: America\/Bogota/)).toBeDefined();
  });

  it('403 de la API: aviso de administración, sin nombrar permisos, y el título sigue', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockRejectedValue(
      new reportesApi.ErrorReportesApi('SIN_PERMISO', 'No tienes permiso.', 403),
    );

    render(<ReportesPage />);

    const alerta = await screen.findByTestId('reportes-sin-permiso');
    expect(alerta.textContent).toContain('Esta vista es de administración');
    expect(alerta.textContent).not.toMatch(/ver_todas|ver_agencia|permiso/i);
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('error de red: mensaje y «Reintentar»', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockRejectedValue(
      new reportesApi.ErrorReportesApi('ERROR_CONEXION', 'No fue posible conectar.'),
    );
    render(<ReportesPage />);
    expect(await screen.findByTestId('reportes-error')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
  });
});

describe('ReportesPage: el dashboard de administración se monta por la respuesta (T-344)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    busqueda = '';
    replace.mockClear();
    vi.spyOn(crmApi, 'obtenerPendientesDelDiaApi').mockResolvedValue({
      vencidos: [],
      deHoy: [],
    } as never);
  });

  it('con alcance AGENCIA se monta con el periodo y la zona de la pantalla, solo con los bloques que ReportesListo no trae', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false),
    );
    render(<ReportesPage />);
    const montado = await screen.findByTestId('dashboard-admin-montado');
    expect(montado.getAttribute('data-periodo')).toBe('este_mes');
    expect(montado.getAttribute('data-zona')).toBeTruthy();
    expect(montado.getAttribute('data-bloques')).toBe('asesores,cobros,salidas,destinos');
    // Y lo de T-343 sigue donde estaba.
    expect(screen.getByTestId('kpi-ventas')).toBeDefined();
    expect(screen.getByTestId('reportes-ambito')).toBeDefined();
  });

  it('con alcance PROPIO no se monta, aunque la sesión tenga permisos de sobra', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false, 'PROPIO'),
    );
    render(<ReportesPage />);
    await screen.findByRole('heading', { level: 1, name: 'Mis números' });
    expect(screen.queryByTestId('dashboard-admin-montado')).toBeNull();
  });

  it('con «Míos» se desmonta: esas cifras son de toda la agencia', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false),
    );
    render(<ReportesPage />);
    await screen.findByTestId('dashboard-admin-montado');
    fireEvent.change(screen.getByTestId('reportes-ambito'), { target: { value: 'yo' } });
    await waitFor(() => expect(screen.queryByTestId('dashboard-admin-montado')).toBeNull());
  });

  it('si cambia el periodo, el dashboard recibe el nuevo', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);
    vi.spyOn(reportesApi, 'obtenerResumenDeReportesApi').mockResolvedValue(
      fixtureDosMonedas(false),
    );
    render(<ReportesPage />);
    await screen.findByTestId('dashboard-admin-montado');
    fireEvent.change(screen.getByLabelText('Periodo'), { target: { value: 'trimestre' } });
    await waitFor(() =>
      expect(screen.getByTestId('dashboard-admin-montado').getAttribute('data-periodo')).toBe(
        'trimestre',
      ),
    );
  });
});
