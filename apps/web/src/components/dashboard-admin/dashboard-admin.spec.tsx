import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DashboardAdmin } from './dashboard-admin';
import * as api from '../../lib/dashboard-admin-api';
import { ErrorReportesApi } from '../../lib/reportes-api';
import { crearResumenDeAgenciaDemo, crearVistaDeCobrosDemo } from '../../lib/dashboard-admin-api';

vi.mock('next/link', () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...r}>
      {children}
    </a>
  ),
}));

const AHORA = new Date('2026-11-21T15:00:00Z');

function conMargen(r: ReturnType<typeof crearResumenDeAgenciaDemo>) {
  return {
    ...r,
    ventasPorMoneda: r.ventasPorMoneda.map((v) => ({
      ...v,
      neto: { ...v.ventas, unidades: String(Math.round(Number(v.ventas.unidades) * 0.8)) },
      margen: { ...v.ventas, unidades: String(Math.round(Number(v.ventas.unidades) * 0.2)) },
      margenPorcentaje: 20,
      cotizacionesSinNeto: 0,
    })),
  };
}

function montar() {
  return render(<DashboardAdmin ahora={AHORA} zona="America/Bogota" />);
}

const RANGO_DEMO = { desde: '2026-11-01T05:00:00.000Z', hasta: '2026-11-22T05:00:00.000Z' };

/** Lo que el servidor devuelve para la agencia: con `porAsesor` y `ventasPorDestino` (T-531, T-532). */
function conDesglose(r: ReturnType<typeof crearResumenDeAgenciaDemo>) {
  const v = crearResumenDeAgenciaDemo(RANGO_DEMO, 'a1');
  const { porEtapa: _porEtapa, ...oportunidades } = v.oportunidades;
  return {
    ...r,
    porAsesor: [
      {
        asesorId: 'a1',
        cotizaciones: v.cotizaciones,
        ventasPorMoneda: v.ventasPorMoneda,
        oportunidades,
        respuesta: v.respuesta,
      },
    ],
    ventasPorDestino: [
      {
        destino: 'Cartagena',
        moneda: 'COP' as const,
        cotizacionesAceptadas: 2,
        ventas: { moneda: 'COP' as const, unidades: '12000000' },
      },
      {
        destino: 'Cartagena',
        moneda: 'USD' as const,
        cotizacionesAceptadas: 1,
        ventas: { moneda: 'USD' as const, unidades: '384000' },
      },
      {
        destino: 'Miami',
        moneda: 'USD' as const,
        cotizacionesAceptadas: 1,
        ventas: { moneda: 'USD' as const, unidades: '500000' },
      },
    ],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'obtenerResumenDeAgenciaApi').mockImplementation((rango, asesorId) =>
    Promise.resolve(conDesglose(crearResumenDeAgenciaDemo(rango, asesorId))),
  );
  vi.spyOn(api, 'obtenerEquipoParaCompararApi').mockResolvedValue([
    { id: 'a1', nombre: 'Valentina Rojas', activo: true },
    { id: 'a2', nombre: 'Beto Gómez', activo: true },
  ]);
  vi.spyOn(api, 'obtenerVistaDeCobrosApi').mockResolvedValue(crearVistaDeCobrosDemo(AHORA));
});

afterEach(cleanup);

describe('DashboardAdmin', () => {
  it('pinta todos los bloques con datos y rotula el periodo en la zona de la agencia', async () => {
    montar();
    expect(await screen.findByTestId('admin-ventas-COP')).toBeTruthy();
    expect(screen.getByTestId('rotulo-periodo').textContent).toMatch(/comparado con/);
    for (const id of [
      'ventas',
      'embudo',
      'respuesta',
      'asesores',
      'cobros',
      'salidas',
      'destinos',
    ]) {
      expect(screen.getByTestId(`bloque-${id}`)).toBeTruthy();
    }
    // Dinero siempre por moneda: hay COP y USD, cada uno en su tarjeta, sin un total.
    expect(screen.getByTestId('admin-ventas-USD')).toBeTruthy();
    expect(screen.queryByText(/total general/i)).toBeNull();
    // Comparación entre periodos.
    expect(within(screen.getByTestId('admin-ventas-COP')).getByText(/frente a/)).toBeTruthy();
  });

  it('sin la clave de margen en la respuesta no hay margen en ninguna parte', async () => {
    montar();
    await screen.findByTestId('admin-ventas-COP');
    expect(screen.queryByText(/^Margen$/)).toBeNull();
    expect(screen.queryByLabelText(/Margen en/)).toBeNull();
  });

  it('con la clave de margen en la respuesta, lo muestra', async () => {
    vi.spyOn(api, 'obtenerResumenDeAgenciaApi').mockImplementation((rango, asesorId) =>
      Promise.resolve(conMargen(crearResumenDeAgenciaDemo(rango, asesorId))),
    );
    montar();
    await screen.findByTestId('admin-ventas-COP');
    expect(screen.getByLabelText('Margen en COP')).toBeTruthy();
  });

  it('si el servidor responde alcance propio, muestra el aviso de administración y nada más', async () => {
    vi.spyOn(api, 'obtenerResumenDeAgenciaApi').mockRejectedValue(
      new ErrorReportesApi('ALCANCE_PROPIO', 'Esta vista es de administración.', 200),
    );
    montar();
    expect(await screen.findByTestId('dashboard-administracion-sin-alcance')).toBeTruthy();
    expect(screen.queryByTestId('bloque-ventas')).toBeNull();
  });

  it('los cobros sin permiso se explican y no apagan las ventas', async () => {
    vi.spyOn(api, 'obtenerVistaDeCobrosApi').mockRejectedValue(
      new ErrorReportesApi(
        'PERMISO_DENEGADO',
        'Tu rol no tiene permiso para ver esta información.',
        403,
      ),
    );
    montar();
    await screen.findByTestId('admin-ventas-COP');
    await waitFor(() =>
      expect(
        within(screen.getByTestId('bloque-cobros')).getByText(/no tiene permiso/i),
      ).toBeTruthy(),
    );
    expect(
      within(screen.getByTestId('bloque-cobros')).queryByRole('button', { name: 'Reintentar' }),
    ).toBeNull();
    expect(screen.getByTestId('admin-ventas-COP')).toBeTruthy();
  });

  it('un error de red muestra «Reintentar» y reintenta solo ese bloque', async () => {
    const cobros = vi
      .spyOn(api, 'obtenerVistaDeCobrosApi')
      .mockRejectedValueOnce(new ErrorReportesApi('ERROR_CONEXION', 'x'))
      .mockResolvedValue(crearVistaDeCobrosDemo(AHORA));
    montar();
    const boton = await within(await screen.findByTestId('bloque-cobros')).findByRole('button', {
      name: 'Reintentar',
    });
    fireEvent.click(boton);
    await waitFor(() => expect(screen.getByTestId('cobros-COP')).toBeTruthy());
    expect(cobros).toHaveBeenCalledTimes(2);
  });

  it('el asesor sin actividad sale completado con el equipo, no ausente ni con ceros', async () => {
    montar();
    const tabla = await screen.findByTestId('tabla-asesores');
    expect(within(tabla).getByText('Valentina Rojas')).toBeTruthy();
    // Beto no viene en `porAsesor` (no tuvo nada en el periodo): sale «Sin actividad».
    const filaBeto = within(tabla).getByText('Beto Gómez').closest('tr');
    expect(filaBeto?.textContent).toContain('Sin actividad en el periodo');
  });

  it('nunca pide el resumen una vez por asesor (T-555): todas las consultas son de la agencia', async () => {
    const espia = vi.spyOn(api, 'obtenerResumenDeAgenciaApi');
    montar();
    await screen.findByTestId('tabla-asesores');
    expect(espia.mock.calls.length).toBeGreaterThan(0);
    expect(espia.mock.calls.every(([, asesorId]) => asesorId === undefined)).toBe(true);
  });

  it('con 15 asesores se listan los 15: ya no hay tope de 12 ni aviso de recorte', async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `x${i + 1}`);
    vi.spyOn(api, 'obtenerEquipoParaCompararApi').mockResolvedValue(
      ids.map((id) => ({ id, nombre: `Asesor ${id}`, activo: true })),
    );
    vi.spyOn(api, 'obtenerResumenDeAgenciaApi').mockImplementation((rango, asesorId) => {
      const base = conDesglose(crearResumenDeAgenciaDemo(rango, asesorId));
      const [plantilla] = base.porAsesor;
      return Promise.resolve({
        ...base,
        porAsesor: ids.map((id) => ({ ...plantilla!, asesorId: id })),
      });
    });
    montar();
    const tabla = await screen.findByTestId('tabla-asesores');
    expect(within(tabla).getAllByTestId('fila-asesor')).toHaveLength(15);
    expect(screen.queryByText(/primeros 12/)).toBeNull();
  });

  it('Destinos son las ventas del periodo: una fila por moneda, sin sumar COP con USD (R8)', async () => {
    montar();
    const bloque = await screen.findByTestId('bloque-destinos');
    await within(bloque).findAllByTestId('destino-vendido');
    expect(within(bloque).getByRole('heading', { name: 'Ventas por destino' })).toBeTruthy();
    expect(bloque.textContent).not.toMatch(/archivos abiertos/i);
    const destinos = within(bloque).getAllByTestId('destino-vendido');
    expect(destinos.map((d) => d.textContent)).toEqual([
      expect.stringContaining('Cartagena'),
      expect.stringContaining('Miami'),
    ]);
    // Cartagena: COP en pesos (unidad mínima de COP) y USD en centavos, cada uno en su línea.
    const cartagena = destinos[0]!;
    expect(within(cartagena).getByTestId('destino-vendido-COP').textContent).toContain(
      '12.000.000',
    );
    expect(within(cartagena).getByTestId('destino-vendido-USD').textContent).toContain('3.840,00');
    expect(within(cartagena).getByText(/3 cotizaciones aceptadas/)).toBeTruthy();
  });

  it('si el servidor no manda ventasPorDestino ni porAsesor, lo dice en vez de pintar «sin ventas»', async () => {
    vi.spyOn(api, 'obtenerResumenDeAgenciaApi').mockImplementation((rango, asesorId) =>
      Promise.resolve(crearResumenDeAgenciaDemo(rango, asesorId)),
    );
    montar();
    expect(await screen.findByTestId('destinos-no-disponible')).toBeTruthy();
    expect(await screen.findByTestId('asesores-no-disponible')).toBeTruthy();
  });

  it('en la lista de salidas el archivo enlaza a su ficha y la urgente lleva texto, no solo color', async () => {
    montar();
    const salidas = await screen.findAllByTestId('salida-proxima');
    expect(salidas.length).toBeGreaterThan(0);
    const primera = salidas[0] as HTMLElement;
    expect(within(primera).getByRole('link').getAttribute('href')).toMatch(/^\/viajes\?id=/);
    expect(primera.textContent).toMatch(/Debe \$/);
    expect(primera.textContent).toMatch(/Sale (hoy|mañana|en \d+ días)/);
  });

  it('no pinta datos personales de viajeros: sin teléfonos ni documentos', async () => {
    montar();
    await screen.findByTestId('admin-ventas-COP');
    await screen.findAllByTestId('salida-proxima');
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/\+57\s?3\d{2}/);
    expect(texto).not.toMatch(/pasaporte|documento de identidad|fecha de nacimiento/i);
  });

  it('pide el periodo anterior del mismo largo para comparar', async () => {
    const espia = vi.spyOn(api, 'obtenerResumenDeAgenciaApi');
    montar();
    await screen.findByTestId('admin-ventas-COP');
    const rangos = espia.mock.calls.filter(([, asesor]) => asesor === undefined).map(([r]) => r);
    expect(rangos).toHaveLength(2);
    const [actual, anterior] = rangos as [
      { desde: string; hasta: string },
      { desde: string; hasta: string },
    ];
    expect(anterior.hasta).toBe(actual.desde);
    expect(Date.parse(anterior.hasta) - Date.parse(anterior.desde)).toBe(
      Date.parse(actual.hasta) - Date.parse(actual.desde),
    );
  });

  it('con `bloques` solo pinta esos y no pide los datos de los demás', async () => {
    const resumen = vi.spyOn(api, 'obtenerResumenDeAgenciaApi');
    const cobros = vi.spyOn(api, 'obtenerVistaDeCobrosApi');
    render(
      <DashboardAdmin ahora={AHORA} zona="America/Bogota" bloques={['asesores', 'salidas']} />,
    );
    await screen.findByTestId('tabla-asesores');
    await screen.findAllByTestId('salida-proxima');
    expect(screen.queryByTestId('bloque-ventas')).toBeNull();
    expect(screen.queryByTestId('bloque-embudo')).toBeNull();
    expect(screen.queryByTestId('bloque-cobros')).toBeNull();
    expect(screen.queryByTestId('rotulo-periodo')).toBeNull();
    // Los cobros se piden (alimentan «salidas»). «Asesores» sale del resumen de la agencia: UNA
    // consulta (la del periodo; no hay comparación, así que no se pide el anterior).
    expect(cobros).toHaveBeenCalledTimes(1);
    expect(resumen).toHaveBeenCalledTimes(1);
    expect(resumen.mock.calls[0]?.[1]).toBeUndefined();
  });
});
