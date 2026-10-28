import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BloqueCamposPersonalizados } from './bloque-campos-personalizados';

describe('BloqueCamposPersonalizados (T-026)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renderiza la lista de campos para viajeros/contactos por defecto', () => {
    render(<BloqueCamposPersonalizados />);

    expect(screen.getByText(/Campos Personalizados/i)).toBeDefined();
    expect(screen.getByText(/Número de Pasaporte/i)).toBeDefined();
    expect(screen.getByText(/Segmento de Viajero/i)).toBeDefined();
  });

  it('permite cambiar a la pestaña de Oportunidades', () => {
    render(<BloqueCamposPersonalizados />);

    const botonOportunidades = screen.getByRole('button', { name: /Oportunidades Comerciales/i });
    fireEvent.click(botonOportunidades);

    expect(screen.getByText(/Presupuesto Máximo Estimado/i)).toBeDefined();
    expect(screen.getByText(/Flexibilidad de Fechas/i)).toBeDefined();
  });

  it('valida que el nombre no esté vacío al crear un nuevo campo', () => {
    render(<BloqueCamposPersonalizados />);

    const botonNuevo = screen.getByRole('button', { name: /Crear campo/i });
    fireEvent.click(botonNuevo);

    expect(screen.getByText(/Nuevo Campo Personalizado/i)).toBeDefined();

    const botonGuardar = screen.getByRole('button', { name: /Guardar Campo/i });
    fireEvent.click(botonGuardar);

    expect(screen.getByText(/El nombre del campo es obligatorio/i)).toBeDefined();
  });

  it('permite crear un nuevo campo de tipo lista con opciones', () => {
    render(<BloqueCamposPersonalizados />);

    fireEvent.click(screen.getByRole('button', { name: /Crear campo/i }));

    const inputNombre = screen.getByPlaceholderText(/Ej: Número de Pasaporte/i);
    fireEvent.change(inputNombre, { target: { value: 'Aerolínea Preferida' } });

    const selectTipo = screen.getByRole('combobox');
    fireEvent.change(selectTipo, { target: { value: 'lista' } });

    const inputOpciones = screen.getByPlaceholderText(/Opción 1, Opción 2, Opción 3/i);
    fireEvent.change(inputOpciones, { target: { value: 'Avianca, LATAM, Wingo' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Campo/i }));

    expect(screen.getAllByText(/Aerolínea Preferida/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Avianca')).toBeDefined();
    expect(screen.getByText('LATAM')).toBeDefined();
    expect(screen.getByText('Wingo')).toBeDefined();
  });

  it('permite eliminar un campo existente', () => {
    render(<BloqueCamposPersonalizados />);

    const campoAEliminar = screen.getByText(/Número de Pasaporte/i);
    expect(campoAEliminar).toBeDefined();

    const botonEliminar = screen.getByRole('button', {
      name: /Eliminar campo "Número de Pasaporte"/i,
    });
    fireEvent.click(botonEliminar);

    expect(screen.queryByText(/Número de Pasaporte/i)).toBeNull();
  });
});
