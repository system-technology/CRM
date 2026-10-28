import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeccionCamposPersonalizados } from './seccion-campos-personalizados';
import { guardarCamposDefinidosStorage } from '../../lib/campos-personalizados-logica';

describe('SeccionCamposPersonalizados (T-026)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renderiza los campos de viajero y permite guardar valores válidos', () => {
    guardarCamposDefinidosStorage([
      {
        id: 'c1',
        clave: 'alergia',
        nombre: 'Alergias',
        tipo: 'texto',
        entidad: 'contacto',
        requerido: false,
      },
    ]);

    const onGuardarMock = vi.fn();

    render(
      <SeccionCamposPersonalizados
        entidad="contacto"
        entidadId="viajero-123"
        onGuardar={onGuardarMock}
      />,
    );

    expect(screen.getByText(/Campos Personalizados/i)).toBeDefined();
    expect(screen.getByLabelText(/Alergias/i)).toBeDefined();

    const inputAlergia = screen.getByLabelText(/Alergias/i);
    fireEvent.change(inputAlergia, { target: { value: 'Mariscos' } });

    const botonGuardar = screen.getByRole('button', { name: /Guardar campos/i });
    fireEvent.click(botonGuardar);

    expect(onGuardarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alergia: 'Mariscos',
      }),
    );
    expect(screen.getByText(/Guardado/i)).toBeDefined();
  });

  it('valida campos obligatorios y bloquea el guardado si están vacíos', () => {
    guardarCamposDefinidosStorage([
      {
        id: 'c2',
        clave: 'pasaporte',
        nombre: 'Pasaporte',
        tipo: 'texto',
        entidad: 'contacto',
        requerido: true,
      },
    ]);

    const onGuardarMock = vi.fn();

    render(
      <SeccionCamposPersonalizados
        entidad="contacto"
        entidadId="viajero-456"
        onGuardar={onGuardarMock}
      />,
    );

    const botonGuardar = screen.getByRole('button', { name: /Guardar campos/i });
    fireEvent.click(botonGuardar);

    expect(screen.getByText(/es obligatorio/i)).toBeDefined();
    expect(onGuardarMock).not.toHaveBeenCalled();
  });
});
