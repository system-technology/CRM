import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoCatalogo } from './paso-catalogo';
import { inicializarProgresoOnboarding } from '../../lib/onboarding-logica';

describe('PasoCatalogo — Configuración de Catálogo Turístico (T-105)', () => {
  const datosIniciales = inicializarProgresoOnboarding('t-test').catalogo;

  it('1. Renderiza las opciones de estrategia de catálogo', () => {
    render(<PasoCatalogo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    expect(screen.getByTestId('opcion-catalogo-semilla')).toBeDefined();
    expect(screen.getByTestId('opcion-catalogo-manual')).toBeDefined();
    expect(screen.getByTestId('opcion-catalogo-csv')).toBeDefined();
    expect(screen.getByText('Pasadía Islas del Rosario & Acuario San Martín')).toBeDefined();
  });

  it('2. Permite alternar la selección de excursiones predefinidas', () => {
    render(<PasoCatalogo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    const excursion = screen.getByText('Pasadía Islas del Rosario & Acuario San Martín');
    fireEvent.click(excursion);

    // Se actualiza el conteo de seleccionadas
    expect(screen.getByText(/seleccionadas/)).toBeDefined();
  });

  it('3. Permite cambiar a la estrategia manual y agregar un producto', () => {
    render(<PasoCatalogo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    const btnManual = screen.getByTestId('opcion-catalogo-manual');
    fireEvent.click(btnManual);

    expect(screen.getByText('Crear primera excursión personalizada')).toBeDefined();

    const inputTitulo = screen.getByPlaceholderText('Ej. Tour Manglares & Ciénaga de la Virgen');
    fireEvent.change(inputTitulo, { target: { value: 'Tour Privado San Bernardo' } });

    const btnAgregar = screen.getByText('Agregar Excursión a la Lista');
    fireEvent.click(btnAgregar);

    expect(screen.getByText('Tour Privado San Bernardo')).toBeDefined();
  });

  it('4. Ejecuta alGuardar con la estrategia y excursiones configuradas', () => {
    const alGuardar = vi.fn();
    render(<PasoCatalogo datos={datosIniciales} alGuardar={alGuardar} alOmitir={vi.fn()} />);

    const btnGuardar = screen.getByTestId('btn-guardar-paso-catalogo');
    fireEvent.click(btnGuardar);

    expect(alGuardar).toHaveBeenCalledTimes(1);
    expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        estrategia: 'semilla_demo',
      }),
    );
  });

  it('5. Ejecuta alOmitir al hacer clic en Omitir por ahora', () => {
    const alOmitir = vi.fn();
    render(<PasoCatalogo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={alOmitir} />);

    const btnOmitir = screen.getByTestId('btn-omitir-paso-catalogo');
    fireEvent.click(btnOmitir);

    expect(alOmitir).toHaveBeenCalledTimes(1);
  });
});
