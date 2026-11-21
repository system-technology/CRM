import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TablaDeLineas } from './tabla-de-lineas';

const COLUMNAS = [
  { id: 'concepto', titulo: 'Pasajero', esConcepto: true },
  { id: 'cantidad', titulo: 'Cantidad', derecha: true },
  { id: 'subtotal', titulo: 'Subtotal', derecha: true, esSubtotal: true },
];

describe('TablaDeLineas (T-321)', () => {
  function montar() {
    return render(
      <TablaDeLineas
        testId="t"
        columnas={COLUMNAS}
        filas={[
          { clave: 'a', celdas: { concepto: 'Adulto', cantidad: '2x', subtotal: '$ 5.400.000' } },
        ]}
        etiquetaTotal="Total Cotización:"
        total="$ 10.800.000 COP"
      />,
    );
  }

  it('el total sale entero: una sola vez en el DOM, sin partirse y sin cortarse', () => {
    montar();
    const total = screen.getByTestId('t-total');
    expect(total.textContent).toBe('$ 10.800.000 COP');
    // No se parte («10.800.») ni se encoge en el renglón del celular.
    expect(total.className).toContain('whitespace-nowrap');
    expect(total.className).toContain('shrink-0');
    // Un solo DOM: la cifra del total no está duplicada para móvil y escritorio.
    expect(screen.getAllByText('$ 10.800.000 COP')).toHaveLength(1);
  });

  it('en el celular las filas son tarjetas (sin scroll interno) y desde md vuelve la tabla', () => {
    montar();
    const contenedor = screen.getByTestId('t');
    // El scroll horizontal solo existe desde md.
    expect(contenedor.className).toContain('md:overflow-x-auto');
    expect(contenedor.className).not.toMatch(/(^|\s)overflow-x-auto/);
    const tabla = screen.getByRole('table', { hidden: true });
    expect(tabla.className).toContain('block');
    expect(tabla.className).toContain('md:table');
  });

  it('cada cifra lleva su etiqueta para leerse sola en la tarjeta móvil', () => {
    montar();
    const celdas = Array.from(document.querySelectorAll('tbody td'));
    expect(celdas.map((c) => c.getAttribute('data-etiqueta'))).toEqual([
      'Pasajero',
      'Cantidad',
      'Subtotal',
    ]);
  });
});
