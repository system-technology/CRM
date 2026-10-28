import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoMarca } from './paso-marca';
import { inicializarProgresoOnboarding } from '../../lib/onboarding-logica';

describe('PasoMarca — Configuración de Marca e Identidad (T-105)', () => {
  const datosIniciales = inicializarProgresoOnboarding('t-test', 'Caribe Tour').marca;

  it('1. Renderiza los campos principales de identidad y marca', () => {
    render(<PasoMarca datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    expect(screen.getByText('Datos Principales de la Agencia')).toBeDefined();
    expect(screen.getByDisplayValue('Caribe Tour')).toBeDefined();
    expect(screen.getByText('Color de Acento de la Agencia (T-039)')).toBeDefined();
    expect(screen.getByText('Dorado Cartagena')).toBeDefined();
  });

  it('2. Permite seleccionar una paleta predefinida y actualiza el color', () => {
    render(<PasoMarca datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    const botonAzul = screen.getByText('Azul Caribe');
    fireEvent.click(botonAzul);

    expect(screen.getByDisplayValue('#0284C7')).toBeDefined();
  });

  it('3. Muestra error de validación si el nombre está vacío', () => {
    const alGuardar = vi.fn();
    render(<PasoMarca datos={datosIniciales} alGuardar={alGuardar} alOmitir={vi.fn()} />);

    const inputNombre = screen.getByDisplayValue('Caribe Tour');
    fireEvent.change(inputNombre, { target: { value: ' ' } });

    const btnGuardar = screen.getByTestId('btn-guardar-paso-marca');
    fireEvent.click(btnGuardar);

    expect(alGuardar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('4. Ejecuta alGuardar cuando los datos son válidos', () => {
    const alGuardar = vi.fn();
    render(<PasoMarca datos={datosIniciales} alGuardar={alGuardar} alOmitir={vi.fn()} />);

    const btnGuardar = screen.getByTestId('btn-guardar-paso-marca');
    fireEvent.click(btnGuardar);

    expect(alGuardar).toHaveBeenCalledTimes(1);
    expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreComercial: 'Caribe Tour',
        colorAcento: '#C9A24B',
      }),
    );
  });

  it('5. Ejecuta alOmitir al hacer clic en Omitir por ahora', () => {
    const alOmitir = vi.fn();
    render(<PasoMarca datos={datosIniciales} alGuardar={vi.fn()} alOmitir={alOmitir} />);

    const btnOmitir = screen.getByTestId('btn-omitir-paso-marca');
    fireEvent.click(btnOmitir);

    expect(alOmitir).toHaveBeenCalledTimes(1);
  });
});
