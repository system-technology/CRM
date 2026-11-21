import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChipDeEtiqueta } from './chip-de-etiqueta';
import { EtiquetasDeFila } from './etiquetas-de-fila';

const e = (n: number, nombre: string, color: 'verde' | 'ambar' | 'azul' = 'verde') => ({
  id: `00000000-0004-4000-8000-00000000000${n}`,
  nombre,
  color,
});

describe('ChipDeEtiqueta: nombre escrito, nunca solo color', () => {
  it('muestra el nombre y los tokens de su color', () => {
    render(<ChipDeEtiqueta etiqueta={e(1, 'Pagado', 'verde')} />);
    const chip = screen.getByTestId('chip-de-etiqueta');
    expect(within(chip).getByText('Pagado')).toBeDefined();
    expect(chip.className).toContain('bg-etiqueta-verde-fondo');
    expect(chip.className).toContain('text-etiqueta-verde-texto');
    expect(chip.getAttribute('data-color')).toBe('verde');
    // El nombre completo también en el title (se corta con «…» si es largo).
    expect(chip.getAttribute('title')).toBe('Pagado');
  });

  it('en la lista no es un botón: no hay «×»', () => {
    render(<ChipDeEtiqueta etiqueta={e(1, 'Pagado')} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('con onQuitar lleva «Quitar etiqueta Pagado» de 44 × 44 px en móvil', () => {
    const onQuitar = vi.fn();
    render(<ChipDeEtiqueta etiqueta={e(1, 'Pagado')} onQuitar={onQuitar} />);
    const x = screen.getByRole('button', { name: 'Quitar etiqueta Pagado' });
    expect(x.className).toContain('min-h-[44px]');
    expect(x.className).toContain('min-w-[44px]');
    fireEvent.click(x);
    expect(onQuitar).toHaveBeenCalledTimes(1);
  });

  it('ocupada no admite otro toque', () => {
    const onQuitar = vi.fn();
    render(<ChipDeEtiqueta etiqueta={e(1, 'Pagado')} onQuitar={onQuitar} ocupada />);
    const x = screen.getByRole('button', { name: 'Quitar etiqueta Pagado' });
    expect(x).toHaveProperty('disabled', true);
  });

  it('un nombre de 30 caracteres se corta con puntos suspensivos (clase truncate) y no desborda', () => {
    const largo = 'Cotización enviada sin respues';
    expect(largo).toHaveLength(30);
    render(<ChipDeEtiqueta etiqueta={e(1, largo)} anchoMaximo="fila" />);
    const texto = screen.getByText(largo);
    expect(texto.className).toContain('truncate');
    expect(texto.className).toContain('max-w-[9rem]');
  });
});

describe('EtiquetasDeFila: 2 + «+N», sin reservar la línea', () => {
  it('sin etiquetas no pinta nada', () => {
    const { container } = render(<EtiquetasDeFila etiquetas={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('con dos o menos, todas y sin «+N»', () => {
    render(<EtiquetasDeFila etiquetas={[e(1, 'Pagado'), e(2, 'Pago pendiente', 'ambar')]} />);
    expect(screen.getAllByTestId('chip-de-etiqueta')).toHaveLength(2);
    expect(screen.queryByTestId('etiquetas-ocultas')).toBeNull();
  });

  it('con cuatro, dos chips y «+2» con los nombres para lector de pantalla', () => {
    render(
      <EtiquetasDeFila
        etiquetas={[e(1, 'Pagado'), e(2, 'Pago pendiente'), e(3, 'Seguimiento'), e(4, 'VIP')]}
      />,
    );
    expect(screen.getAllByTestId('chip-de-etiqueta')).toHaveLength(2);
    const mas = screen.getByTestId('etiquetas-ocultas');
    expect(mas.textContent).toContain('+2');
    expect(mas.textContent).toContain('Seguimiento, VIP');
    expect(mas.getAttribute('title')).toBe('Seguimiento, VIP');
  });

  it('no es interactivo y no admite desplazamiento lateral', () => {
    render(<EtiquetasDeFila etiquetas={[e(1, 'Pagado')]} />);
    expect(screen.queryByRole('button')).toBeNull();
    const fila = screen.getByTestId('etiquetas-de-fila');
    expect(fila.className).toContain('overflow-hidden');
    expect(fila.className).toContain('flex-nowrap');
  });
});
