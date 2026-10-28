import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoEquipo } from './paso-equipo';
import { inicializarProgresoOnboarding } from '../../lib/onboarding-logica';

describe('PasoEquipo — Invitación de Asesores y Roles (T-105)', () => {
  const datosIniciales = inicializarProgresoOnboarding('t-test').equipo;

  it('1. Renderiza los roles y el formulario de invitación', () => {
    render(<PasoEquipo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    expect(screen.getAllByText('Asesor de Viajes')[0]).toBeDefined();
    expect(screen.getAllByText('Admin de Agencia')[0]).toBeDefined();
    expect(screen.getAllByText('Coordinador Operativo')[0]).toBeDefined();
    expect(screen.getByText('Invitar un Compañero de Equipo')).toBeDefined();
  });

  it('2. Valida correo requerido y formato al agregar un miembro', () => {
    render(<PasoEquipo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    const btnAgregar = screen.getByTestId('btn-agregar-miembro-onboarding');
    fireEvent.click(btnAgregar);

    expect(screen.getByText(/correo electrónico es requerido/i)).toBeDefined();

    const inputCorreo = screen.getByPlaceholderText('asesor@miagencia.com');
    fireEvent.change(inputCorreo, { target: { value: 'correo-sin-formato' } });
    fireEvent.click(btnAgregar);

    expect(screen.getByText(/formato de correo electrónico válido/i)).toBeDefined();
  });

  it('3. Agrega y elimina un miembro de la lista', () => {
    render(<PasoEquipo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    const inputCorreo = screen.getByPlaceholderText('asesor@miagencia.com');
    const inputNombre = screen.getByPlaceholderText('Ej. Juan Pérez');
    const btnAgregar = screen.getByTestId('btn-agregar-miembro-onboarding');

    fireEvent.change(inputCorreo, { target: { value: 'carlos@agencia.com' } });
    fireEvent.change(inputNombre, { target: { value: 'Carlos Mendoza' } });
    fireEvent.click(btnAgregar);

    expect(screen.getByText('Carlos Mendoza')).toBeDefined();
    expect(screen.getByText('carlos@agencia.com')).toBeDefined();

    const btnEliminar = screen.getByLabelText('Eliminar a carlos@agencia.com');
    fireEvent.click(btnEliminar);

    expect(screen.queryByText('Carlos Mendoza')).toBeNull();
  });

  it('4. Ejecuta alGuardar con los miembros agregados', () => {
    const alGuardar = vi.fn();
    render(<PasoEquipo datos={datosIniciales} alGuardar={alGuardar} alOmitir={vi.fn()} />);

    const inputCorreo = screen.getByPlaceholderText('asesor@miagencia.com');
    const btnAgregar = screen.getByTestId('btn-agregar-miembro-onboarding');
    fireEvent.change(inputCorreo, { target: { value: 'laura@agencia.com' } });
    fireEvent.click(btnAgregar);

    const btnGuardar = screen.getByTestId('btn-guardar-paso-equipo');
    fireEvent.click(btnGuardar);

    expect(alGuardar).toHaveBeenCalledTimes(1);
    expect(alGuardar).toHaveBeenCalledWith({
      miembrosInvitados: [
        expect.objectContaining({
          correo: 'laura@agencia.com',
          rol: 'ASESOR',
        }),
      ],
    });
  });

  it('5. Ejecuta alOmitir al hacer clic en Omitir por ahora', () => {
    const alOmitir = vi.fn();
    render(<PasoEquipo datos={datosIniciales} alGuardar={vi.fn()} alOmitir={alOmitir} />);

    const btnOmitir = screen.getByTestId('btn-omitir-paso-equipo');
    fireEvent.click(btnOmitir);

    expect(alOmitir).toHaveBeenCalledTimes(1);
  });
});
