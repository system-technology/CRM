import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CobrosPage from './page';
import * as api from '../../../lib/cobros-api';
import * as auth from '../../../lib/auth-api';
import * as csv from '../../../lib/exportar-csv';
import type { FilaDeCobro, Permiso, VistaDeCobros } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cobros',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('../../../lib/cobros-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cobros-api')>();
  return { ...actual, listarCobros: vi.fn() };
});
vi.mock('../../../lib/auth-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/auth-api')>();
  return { ...actual, obtenerSesionActualApi: vi.fn() };
});
vi.mock('../../../lib/exportar-csv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/exportar-csv')>();
  return { ...actual, descargarArchivoCSV: vi.fn() };
});

const conSesion = (permisos: Permiso[]) =>
  vi.mocked(auth.obtenerSesionActualApi).mockResolvedValue({
    ...auth.MOCK_SESION_UNICA_AGENCIA,
    acceso: { ...auth.MOCK_SESION_UNICA_AGENCIA.acceso!, permisos },
  });

/** Importes en la unidad mínima: COP = pesos (R8). 6.200.000 pesos, no 62.000. */
function fila(n: number, parcial: Partial<FilaDeCobro> = {}): FilaDeCobro {
  return {
    archivoId: `00000000-0030-4000-8000-00000000000${n}`,
    numero: 1040 + n,
    contactoId: '00000000-0020-4000-8000-000000000001',
    destino: n === 1 ? 'Cancún' : 'Madrid',
    fechaSalida: '2026-12-10',
    total: { unidades: '6200000', moneda: 'COP' },
    pagado: { unidades: '3500000', moneda: 'COP' },
    saldo: { unidades: '2700000', moneda: 'COP' },
    situacion: 'PARCIAL',
    estadoDeCobro: 'POR_VENCER',
    fechaLimite: '2026-11-30',
    ...parcial,
  };
}

const vista = (datos: FilaDeCobro[]): VistaDeCobros => ({
  datos,
  totales: datos.length
    ? [
        {
          moneda: 'COP',
          archivos: datos.length,
          total: { unidades: '12400000', moneda: 'COP' },
          pagado: { unidades: '7000000', moneda: 'COP' },
          porCobrar: { unidades: '5400000', moneda: 'COP' },
        },
      ]
    : [],
  truncado: false,
});

describe('Cobros: quién pagó y quién debe (T-332, T-335)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    conSesion(['cobro.ver']);
    vi.mocked(api.listarCobros).mockResolvedValue(vista([fila(1), fila(2)]));
  });

  it('sin cobro.ver no pide nada a la API y lo explica', async () => {
    conSesion(['archivo.ver']);
    render(<CobrosPage />);
    expect(await screen.findByTestId('cobros-sin-acceso')).toBeTruthy();
    expect(api.listarCobros).not.toHaveBeenCalled();
  });

  it('muestra total, pagado y saldo del servidor, en pesos enteros (R8)', async () => {
    render(<CobrosPage />);
    const filas = await screen.findAllByTestId('fila-de-cobro');
    // La tarjeta móvil y la tabla coexisten en el DOM (una se oculta por CSS): se mira la tabla.
    const fila1 = filas.find((f) => f.tagName === 'TR')!;
    expect(fila1.textContent).toContain('Cancún');
    expect(fila1.textContent).toContain('6.200.000');
    expect(fila1.textContent).toContain('3.500.000');
    expect(fila1.textContent).toContain('2.700.000');
    expect(fila1.textContent).not.toContain('62.000,00');
  });

  it('un saldo a favor se dice con palabras, sin signo menos', async () => {
    vi.mocked(api.listarCobros).mockResolvedValue(
      vista([
        fila(1, {
          saldo: { unidades: '-100000', moneda: 'COP' },
          situacion: 'SALDO_A_FAVOR',
          estadoDeCobro: 'AL_DIA',
        }),
      ]),
    );
    render(<CobrosPage />);
    const f = (await screen.findAllByTestId('fila-de-cobro')).find((x) => x.tagName === 'TR')!;
    expect(f.textContent).toContain('Saldo a favor');
    expect(f.textContent).not.toContain('−');
    expect(f.textContent).not.toContain('-$');
  });

  it('cada filtro le pide el estado al SERVIDOR; el cliente no recorta', async () => {
    render(<CobrosPage />);
    await screen.findAllByTestId('fila-de-cobro');
    fireEvent.click(screen.getByRole('button', { name: 'Saldo pendiente' }));
    await waitFor(() =>
      expect(api.listarCobros).toHaveBeenLastCalledWith('SALDO_PENDIENTE', expect.anything()),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vencido' }));
    await waitFor(() =>
      expect(api.listarCobros).toHaveBeenLastCalledWith('VENCIDO', expect.anything()),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() =>
      expect(api.listarCobros).toHaveBeenLastCalledWith(undefined, expect.anything()),
    );
  });

  it('ofrece los cuatro estados de cobro como filtro', async () => {
    render(<CobrosPage />);
    const grupo = await screen.findByRole('group', { name: 'Filtrar por estado de cobro' });
    const nombres = within(grupo)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(nombres).toEqual(['Todos', 'Saldo pendiente', 'Por vencer', 'Vencido', 'Al día']);
  });

  it('exporta exactamente las filas que se ven', async () => {
    render(<CobrosPage />);
    await screen.findAllByTestId('fila-de-cobro');
    fireEvent.click(screen.getByTestId('boton-exportar-cobros-csv'));
    expect(csv.descargarArchivoCSV).toHaveBeenCalledTimes(1);
    const [contenido, nombre] = vi.mocked(csv.descargarArchivoCSV).mock.calls[0]!;
    expect(contenido.replace('﻿', '').split('\r\n')).toHaveLength(3);
    expect(contenido).toContain('Cancún');
    expect(contenido).toContain('Madrid');
    expect(nombre).toMatch(/^cobros-viajapro-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('pasajeros: total y composición en cada archivo; guion si el servidor no lo envía (T-590)', async () => {
    vi.mocked(api.listarCobros).mockResolvedValue(
      vista([fila(1, { pasajeros: { adultos: 2, ninos: 1, infantes: 1, total: 4 } }), fila(2)]),
    );
    render(<CobrosPage />);
    await screen.findAllByTestId('fila-de-cobro');
    const celdas = screen.getAllByTestId('pasajeros-de-cobro');
    // móvil + escritorio: dos presentaciones por archivo
    expect(celdas).toHaveLength(4);
    expect(celdas[0]!.textContent).toBe('4');
    expect(screen.getAllByText('4 pasajeros: 2 adultos, 1 niño, 1 infante')).toHaveLength(2);
    expect(screen.getAllByText('2 ad · 1 niño · 1 inf')).toHaveLength(2);
    expect([celdas[1]!, celdas[3]!].map((c) => c.textContent)).toEqual(['—', '—']);
    expect(screen.getAllByText('Pasajeros: sin dato')).toHaveLength(2);
  });

  it('estado vacío con filtro: lo dice y ofrece volver a «Todos»', async () => {
    vi.mocked(api.listarCobros).mockResolvedValue(vista([]));
    render(<CobrosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vencido' }));
    expect(await screen.findByTestId('cobros-vacio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver todos' })).toBeTruthy();
    expect(screen.getByTestId('boton-exportar-cobros-csv').hasAttribute('disabled')).toBe(true);
  });

  it('error: lo explica y deja reintentar', async () => {
    vi.mocked(api.listarCobros).mockRejectedValueOnce(new Error('sin conexión'));
    render(<CobrosPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('No se pudieron cargar los cobros')).toBeTruthy();
  });

  it('cada archivo enlaza a su detalle', async () => {
    render(<CobrosPage />);
    const f = (await screen.findAllByTestId('fila-de-cobro')).find((x) => x.tagName === 'TR')!;
    expect(within(f).getByRole('link').getAttribute('href')).toBe(
      '/viajes?id=00000000-0030-4000-8000-000000000001',
    );
  });
});
