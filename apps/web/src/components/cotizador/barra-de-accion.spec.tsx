import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarraDeAccionCotizador } from './barra-de-accion';

describe('BarraDeAccionCotizador (T-321)', () => {
  it('muestra el total y «Guardar cotización» pegados al borde, con el botón de 44 px o más', () => {
    const onGuardar = vi.fn();
    render(
      <BarraDeAccionCotizador total="$ 10.800.000 COP" detalle="2 adt" onGuardar={onGuardar} />,
    );

    const barra = screen.getByTestId('barra-de-accion-cotizador');
    // Encima de la barra de navegación móvil (56 px), pegada al borde mientras se desplaza.
    expect(barra.className).toContain('sticky');
    expect(barra.className).toContain('bottom-16');
    expect(screen.getByTestId('total-barra-de-accion').textContent).toBe('$ 10.800.000 COP');

    const boton = screen.getByRole('button', { name: 'Guardar cotización' });
    expect(boton.className).toContain('min-h-[48px]');
    fireEvent.click(boton);
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });

  it('mientras calcula pinta un esqueleto y no deja guardar un total que no existe', () => {
    render(<BarraDeAccionCotizador total={null} onGuardar={vi.fn()} />);
    expect(screen.getByLabelText('Calculando el total')).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar cotización' }).disabled,
    ).toBe(true);
  });

  it('sin permiso queda deshabilitado y explica por qué', () => {
    render(
      <BarraDeAccionCotizador
        total="$ 1 COP"
        onGuardar={vi.fn()}
        deshabilitado
        motivoDeshabilitado="Tu rol no puede guardar cotizaciones"
      />,
    );
    const boton = screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar cotización' });
    expect(boton.disabled).toBe(true);
    expect(boton.title).toBe('Tu rol no puede guardar cotizaciones');
  });
});
