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

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Comparar Versiones Lado a Lado')).toBeDefined();
    expect(screen.getByText(/Cotización Cartagena Familia/i)).toBeDefined();

    // Selectores de versión
    const selectA = screen.getByLabelText<HTMLSelectElement>(/Versión Base \(A\)/i);
    const selectB = screen.getByLabelText<HTMLSelectElement>(/Versión Comparada \(B\)/i);
    expect(selectA.value).toBe('1');
    expect(selectB.value).toBe('2');

    // Muestra diferencias en parámetros
    expect(screen.getByText('Adultos')).toBeDefined();
    expect(screen.getByText('Niños')).toBeDefined();
    expect(screen.getByText('Acomodación')).toBeDefined();
    expect(screen.getByText('Cambió acomodación')).toBeDefined();

    // Muestra líneas con badges
    expect(screen.getByText('Hotel Barú Playa 4★')).toBeDefined();
    expect(screen.getByText('Modificada')).toBeDefined();
    expect(screen.getByText('Traslado Privado Aeropuerto')).toBeDefined();
    expect(screen.getByText('Añadida')).toBeDefined();

    // Muestra Total Venta y variación
    expect(screen.getByText('Total Venta al Cliente')).toBeDefined();
    expect(screen.getByText(/Variación Total:/i)).toBeDefined();
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
    expect(screen.getByText(/Costos netos y márgenes comerciales restringidos/i)).toBeDefined();
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

    expect(await screen.findByText('Tarifa Neta Proveedor')).toBeDefined();
    expect(await screen.findByText('Margen Comercial Agencia')).toBeDefined();
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
