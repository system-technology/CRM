import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TablaGestionCatalogo } from './tabla-gestion-catalogo';
import type { ResumenDePaqueteGestion } from '@viajapro/contracts';

const PAQUETES_PRUEBA: ResumenDePaqueteGestion[] = [
  {
    id: 'paq-001',
    codigo: 'SMR-PLAYA-4D',
    nombre: 'Playa Blanca y Tayrona Mágico',
    destino: 'Santa Marta',
    paisIso: 'CO',
    dias: 4,
    noches: 3,
    planAlimentacion: 'DESAYUNO',
    inclusiones: ['Alojamiento', 'Desayuno'],
    exclusiones: ['Vuelos'],
    descripcion: null,
    activo: true,
    mayoristaId: null,
    desde: [{ moneda: 'COP', unidades: '850000' }],
    desdeEsDeGrupo: false,
    vigenciasActivas: 2,
    creadoEn: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'paq-002',
    codigo: 'CTG-ISLAS-1D',
    nombre: 'Pasadía Islas del Rosario',
    destino: 'Cartagena',
    paisIso: 'CO',
    dias: 1,
    noches: 0,
    planAlimentacion: null,
    inclusiones: ['Lancha', 'Almuerzo'],
    exclusiones: ['Impuesto muelle'],
    descripcion: null,
    activo: false,
    mayoristaId: null,
    desde: [{ moneda: 'COP', unidades: '220000' }],
    desdeEsDeGrupo: false,
    vigenciasActivas: 1,
    creadoEn: '2026-09-20T08:00:00.000Z',
  },
];

describe('TablaGestionCatalogo (T-031)', () => {
  it('muestra el estado de carga cuando cargando es true', () => {
    render(
      <TablaGestionCatalogo
        paquetes={[]}
        alEditar={vi.fn()}
        alDesactivar={vi.fn()}
        alCrear={vi.fn()}
        cargando={true}
      />,
    );

    expect(screen.getByTestId('gestion-catalogo-cargando')).toBeDefined();
    expect(screen.getByText('Cargando catálogo de productos...')).toBeDefined();
  });

  it('muestra estadísticas KPI y los paquetes activos e inactivos', () => {
    render(
      <TablaGestionCatalogo
        paquetes={PAQUETES_PRUEBA}
        alEditar={vi.fn()}
        alDesactivar={vi.fn()}
        alCrear={vi.fn()}
      />,
    );

    // KPIs
    expect(screen.getByTestId('kpi-total-paquetes').textContent).toBe('2');
    expect(screen.getByTestId('kpi-activos-paquetes').textContent).toBe('1');
    expect(screen.getByTestId('kpi-inactivos-paquetes').textContent).toBe('1');

    // Nombres de paquetes
    expect(screen.getByText('Playa Blanca y Tayrona Mágico')).toBeDefined();
    expect(screen.getByText('Pasadía Islas del Rosario')).toBeDefined();

    // Badges de estado
    expect(screen.getByTestId('badge-estado-activo-paq-001')).toBeDefined();
    expect(screen.getByTestId('badge-estado-inactivo-paq-002')).toBeDefined();
  });

  it('filtra por texto de búsqueda', () => {
    render(
      <TablaGestionCatalogo
        paquetes={PAQUETES_PRUEBA}
        alEditar={vi.fn()}
        alDesactivar={vi.fn()}
        alCrear={vi.fn()}
      />,
    );

    const inputBusqueda = screen.getByTestId('buscador-gestion-catalogo');
    fireEvent.change(inputBusqueda, { target: { value: 'Tayrona' } });

    expect(screen.getByText('Playa Blanca y Tayrona Mágico')).toBeDefined();
    expect(screen.queryByText('Pasadía Islas del Rosario')).toBeNull();
  });

  it('filtra por pestañas de estado (Activos / Inactivos)', () => {
    render(
      <TablaGestionCatalogo
        paquetes={PAQUETES_PRUEBA}
        alEditar={vi.fn()}
        alDesactivar={vi.fn()}
        alCrear={vi.fn()}
      />,
    );

    // Clic en pestaña Activos
    const tabActivos = screen.getByTestId('tab-estado-activos');
    fireEvent.click(tabActivos);

    expect(screen.getByText('Playa Blanca y Tayrona Mágico')).toBeDefined();
    expect(screen.queryByText('Pasadía Islas del Rosario')).toBeNull();

    // Clic en pestaña Inactivos
    const tabInactivos = screen.getByTestId('tab-estado-inactivos');
    fireEvent.click(tabInactivos);

    expect(screen.queryByText('Playa Blanca y Tayrona Mágico')).toBeNull();
    expect(screen.getByText('Pasadía Islas del Rosario')).toBeDefined();
  });

  it('dispara el callback alCrear al presionar el botón de nuevo producto', () => {
    const handleCrear = vi.fn();
    render(
      <TablaGestionCatalogo
        paquetes={PAQUETES_PRUEBA}
        alEditar={vi.fn()}
        alDesactivar={vi.fn()}
        alCrear={handleCrear}
      />,
    );

    const btnNuevo = screen.getByTestId('boton-abrir-nuevo-paquete');
    fireEvent.click(btnNuevo);

    expect(handleCrear).toHaveBeenCalledTimes(1);
  });

  it('dispara el callback alEditar al hacer clic en editar', () => {
    const handleEditar = vi.fn();
    render(
      <TablaGestionCatalogo
        paquetes={PAQUETES_PRUEBA}
        alEditar={handleEditar}
        alDesactivar={vi.fn()}
        alCrear={vi.fn()}
      />,
    );

    const btnEditar = screen.getByTestId('boton-editar-paquete-paq-001');
    fireEvent.click(btnEditar);

    expect(handleEditar).toHaveBeenCalledWith(PAQUETES_PRUEBA[0]);
  });

  it('dispara el callback alDesactivar solo para paquetes activos', () => {
    const handleDesactivar = vi.fn();
    render(
      <TablaGestionCatalogo
        paquetes={PAQUETES_PRUEBA}
        alEditar={vi.fn()}
        alDesactivar={handleDesactivar}
        alCrear={vi.fn()}
      />,
    );

    const btnDesactivar = screen.getByTestId('boton-desactivar-paquete-paq-001');
    fireEvent.click(btnDesactivar);

    expect(handleDesactivar).toHaveBeenCalledWith(PAQUETES_PRUEBA[0]);
    // El segundo paquete está inactivo, no tiene botón de desactivar
    expect(screen.queryByTestId('boton-desactivar-paquete-paq-002')).toBeNull();
  });
});
