import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FiltrosPlegables } from './filtros-plegables';

/**
 * Guardas de `FiltrosPlegables` (T-630).
 *
 * Lo que de verdad hay que proteger no es que se pliegue: es que **al plegarse siga diciendo que la
 * lista está filtrada**. Si el contador desaparece, la asesora busca un contacto que sí existe, no lo
 * ve, y no tiene forma de saber por qué. Eso es peor que la muralla de 358 px que esto arregla.
 *
 * Y que en pantalla ancha no cambie nada: el panel lleva `sm:flex`, así que de `sm:` en adelante está
 * siempre a la vista aunque el estado diga «cerrado».
 *
 * jsdom no evalúa `sm:`, así que lo que se comprueba aquí son las clases y el estado; el alto real se
 * midió con el navegador a 390 px.
 */
describe('FiltrosPlegables (T-630)', () => {
  it('en pantalla ancha los filtros están siempre, aunque el estado diga cerrado', () => {
    render(
      <FiltrosPlegables activos={0}>
        <span>un filtro</span>
      </FiltrosPlegables>,
    );
    const panel = screen.getByTestId('panel-de-filtros');
    // Cerrado en móvil (`hidden`) pero visible de `sm:` en adelante: en ancho no depende del estado.
    expect(panel.className).toContain('hidden');
    expect(panel.className).toContain('sm:flex');
    // Y el botón que pliega no existe en pantalla ancha.
    expect(screen.getByTestId('abrir-filtros').className).toContain('sm:hidden');
  });

  it('al desplegar, el panel aparece y lo dice en aria-expanded', () => {
    render(
      <FiltrosPlegables activos={0}>
        <span>un filtro</span>
      </FiltrosPlegables>,
    );
    const boton = screen.getByTestId('abrir-filtros');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(boton.getAttribute('aria-controls')).toBe(screen.getByTestId('panel-de-filtros').id);

    fireEvent.click(boton);

    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('panel-de-filtros').className).toContain('flex');
    expect(screen.getByTestId('panel-de-filtros').className).not.toContain('hidden');
  });

  it('plegado, el botón sigue diciendo cuántos filtros hay puestos', () => {
    const { rerender } = render(
      <FiltrosPlegables activos={0}>
        <span>un filtro</span>
      </FiltrosPlegables>,
    );
    // Sin filtros no hay contador que distraiga.
    expect(screen.queryByTestId('filtros-activos')).toBeNull();

    rerender(
      <FiltrosPlegables activos={2}>
        <span>un filtro</span>
      </FiltrosPlegables>,
    );
    // Con filtros puestos, el número se ve SIN desplegar: es lo que evita la lista filtrada muda.
    expect(screen.getByTestId('filtros-activos').textContent).toBe('2');
    expect(screen.getByTestId('abrir-filtros').getAttribute('aria-expanded')).toBe('false');
  });

  it('el botón que pliega es un objetivo táctil de 44 px', () => {
    render(
      <FiltrosPlegables activos={1}>
        <span>un filtro</span>
      </FiltrosPlegables>,
    );
    expect(screen.getByTestId('abrir-filtros').className).toContain('min-h-[44px]');
  });
});
