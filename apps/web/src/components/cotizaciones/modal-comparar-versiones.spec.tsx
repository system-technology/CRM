import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModalCompararVersiones } from './modal-comparar-versiones';
import * as authApi from '../../lib/auth-api';
import type { VersionDeCotizacion, SesionActual } from '@viajapro/contracts';

const VERSION_1: VersionDeCotizacion = {
  id: '01932000-0000-7000-8000-000000000001',
  numero: 1,
  creadaEn: '2026-11-01T10:00:00Z',
  paqueteId: 'pkg-cartagena',
  paqueteNombre: 'Cartagena Mágica 4D/3N',
  destino: 'Cartagena',
  noches: 3,
  fechaSalida: '2026-12-10',
  vigenciaId: 'vig-1',
  vigenciaDesde: '2026-12-01',
  vigenciaHasta: '2026-12-20',
  deSalidaProgramada: true,
  adultos: 2,
  ninos: 0,
  infantes: 0,
  acomodacion: 'DOBLE',
  lineas: [
    {
      tarifaId: 'tar-hotel',
      nombre: 'Hotel Barú Playa 4★',
      unidad: 'POR_PERSONA',
      cubrePasajeros: 1,
      veces: 2,
      precioUnitario: { unidades: '1000000', moneda: 'COP' },
      total: { unidades: '2000000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '400000', moneda: 'COP' },
    },
  ],
  venta: { unidades: '2000000', moneda: 'COP' },
  neto: { unidades: '1600000', moneda: 'COP' },
  margen: { unidades: '400000', moneda: 'COP' },
  vigenteHasta: '2026-11-20',
};

const VERSION_2: VersionDeCotizacion = {
  id: '01932000-0000-7000-8000-000000000002',
  numero: 2,
  creadaEn: '2026-11-03T15:30:00Z',
  paqueteId: 'pkg-cartagena',
  paqueteNombre: 'Cartagena Mágica 4D/3N',
  destino: 'Cartagena',
  noches: 4,
  fechaSalida: '2026-12-15',
  vigenciaId: 'vig-1',
  vigenciaDesde: '2026-12-01',
  vigenciaHasta: '2026-12-20',
  deSalidaProgramada: true,
  adultos: 2,
  ninos: 1,
  infantes: 0,
  acomodacion: 'TRIPLE',
  lineas: [
    {
      tarifaId: 'tar-hotel',
      nombre: 'Hotel Barú Playa 4★',
      unidad: 'POR_PERSONA',
      cubrePasajeros: 1,
      veces: 3,
      precioUnitario: { unidades: '1000000', moneda: 'COP' },
      total: { unidades: '3000000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '600000', moneda: 'COP' },
    },
    {
      tarifaId: 'tar-traslado',
      nombre: 'Traslado Privado Aeropuerto',
      unidad: 'POR_GRUPO',
      cubrePasajeros: 3,
      veces: 1,
      precioUnitario: { unidades: '150000', moneda: 'COP' },
      total: { unidades: '150000', moneda: 'COP' },
      masBarata: false,
      margen: { unidades: '30000', moneda: 'COP' },
    },
  ],
  venta: { unidades: '3150000', moneda: 'COP' },
  neto: { unidades: '2520000', moneda: 'COP' },
  margen: { unidades: '630000', moneda: 'COP' },
  vigenteHasta: '2026-11-25',
};

const SESION_SIN_PERMISO_MARGEN: SesionActual = {
  identidad: { id: 'usr-1', correo: 'asesor@viajapro.com', nombre: 'Carlos' },
  agencias: [{ id: 'ag-1', nombre: 'Agencia', slug: 'agencia' }],
  tenantActivoId: 'ag-1',
  acceso: {
    usuarioId: 'usr-1',
    rol: 'Asesor',
    permisos: ['cotizacion.escribir'],
  },
};

const SESION_CON_PERMISO_MARGEN: SesionActual = {
  identidad: { id: 'usr-2', correo: 'dueno@viajapro.com', nombre: 'Ana Duena' },
  agencias: [{ id: 'ag-1', nombre: 'Agencia', slug: 'agencia' }],
  tenantActivoId: 'ag-1',
  acceso: {
    usuarioId: 'usr-2',
    rol: 'DUENO',
    permisos: ['cotizacion.ver_neto_y_margen', 'cotizacion.escribir'],
  },
};

describe('ModalCompararVersiones (T-128)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_SIN_PERMISO_MARGEN);
  });

  it('no renderiza nada si abierto es false', async () => {
    const { container } = render(
      <ModalCompararVersiones
        abierto={false}
        onCerrar={vi.fn()}
        versiones={[VERSION_1, VERSION_2]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la comparativa lado a lado con selectores y tablas', async () => {
    render(
      <ModalCompararVersiones
        abierto={true}
        onCerrar={vi.fn()}
        versiones={[VERSION_1, VERSION_2]}
        tituloCotizacion="Cotización Cartagena Familia"
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Comparar Versiones Lado a Lado').textContent).toBe(
      'Comparar Versiones Lado a Lado',
    );
    expect(screen.getByText(/Cotización Cartagena Familia/i).textContent).toBe(
      'Cotización Cartagena Familia · Cartagena Mágica 4D/3N',
    );

    // Selectores de versión
    const selectA = screen.getByLabelText<HTMLSelectElement>(/Versión Base \(A\)/i);
    const selectB = screen.getByLabelText<HTMLSelectElement>(/Versión Comparada \(B\)/i);
    expect(selectA.value).toBe('1');
    expect(selectB.value).toBe('2');

    // Muestra diferencias en parámetros
    const fila = (etiqueta: string) => screen.getByText(etiqueta).closest('tr')?.textContent;
    expect(fila('Adultos')).toBe('Adultos22—');
    expect(fila('Niños')).toBe('Niños01+1');
    expect(fila('Acomodación')).toBe('AcomodaciónDOBLETRIPLECambió acomodación');

    // Muestra líneas con su estado y diferencia exacta
    expect(fila('Hotel Barú Playa 4★')).toBe(
      'Hotel Barú Playa 4★Modificada$ 2.000.0002x a $ 1.000.000$ 3.000.0003x a $ 1.000.000+ $ 1.000.000 COP',
    );
    expect(screen.getByText('Modificada').closest('tr')?.textContent).toContain(
      'Hotel Barú Playa 4★',
    );
    expect(fila('Traslado Privado Aeropuerto')).toContain('Añadida');
    expect(fila('Traslado Privado Aeropuerto')).toContain('+ $ 150.000 COP');

    // Muestra Total Venta y variación con importes exactos
    expect(fila('Total Venta al Cliente')).toBe(
      'Total Venta al Cliente$ 2.000.000$ 3.150.000+ $ 1.150.000 COP+57.5 %',
    );
    expect(screen.getByText(/Variación Total:/i).textContent).toContain(
      'Variación Total: + $ 1.150.000 COP (+57.5 %)',
    );
  });

  it('permite invertir versiones con el botón correspondiente', async () => {
    render(
      <ModalCompararVersiones
        abierto={true}
        onCerrar={vi.fn()}
        versiones={[VERSION_1, VERSION_2]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const botonInvertir = screen.getByLabelText(/Invertir versiones a comparar/i);
    fireEvent.click(botonInvertir);

    const selectA = screen.getByLabelText<HTMLSelectElement>(/Versión Base \(A\)/i);
    const selectB = screen.getByLabelText<HTMLSelectElement>(/Versión Comparada \(B\)/i);
    expect(selectA.value).toBe('2');
    expect(selectB.value).toBe('1');
  });

  it('oculta estrictamente costos netos y margen si el usuario no tiene permiso', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_SIN_PERMISO_MARGEN);

    render(
      <ModalCompararVersiones
        abierto={true}
        onCerrar={vi.fn()}
        versiones={[VERSION_1, VERSION_2]}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText('Tarifa Neta Proveedor')).toBeNull();
    expect(screen.queryByText('Margen Comercial Agencia')).toBeNull();
    expect(screen.getByText(/Costos netos y márgenes comerciales restringidos/i).textContent).toBe(
      'Costos netos y márgenes comerciales restringidos (requiere permiso cotizacion.ver_neto_y_margen).',
    );
  });

  it('muestra costos netos y margen cuando el usuario tiene permiso cotizacion.ver_neto_y_margen', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_CON_PERMISO_MARGEN);

    render(
      <ModalCompararVersiones
        abierto={true}
        onCerrar={vi.fn()}
        versiones={[VERSION_1, VERSION_2]}
      />,
    );

    expect((await screen.findByText('Tarifa Neta Proveedor')).closest('tr')?.textContent).toMatch(
      /^Tarifa Neta Proveedor\$ /,
    );
    expect(
      (await screen.findByText('Margen Comercial Agencia')).closest('tr')?.textContent,
    ).toMatch(/^Margen Comercial Agencia\$ /);
    expect(screen.queryByText(/Costos netos y márgenes comerciales restringidos/i)).toBeNull();
  });

  it('ejecuta onCerrar al hacer clic en el botón de cerrar y con tecla Escape', () => {
    const onCerrar = vi.fn();
    render(
      <ModalCompararVersiones
        abierto={true}
        onCerrar={onCerrar}
        versiones={[VERSION_1, VERSION_2]}
      />,
    );

    const botonCerrarX = screen.getByLabelText(/Cerrar modal de comparación/i);
    fireEvent.click(botonCerrarX);
    expect(onCerrar).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });
});
