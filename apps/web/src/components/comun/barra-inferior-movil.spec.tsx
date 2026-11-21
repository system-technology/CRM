import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { BarraInferiorMovil } from './barra-inferior-movil';

afterEach(cleanup);

function pintar(propiedades: Partial<React.ComponentProps<typeof BarraInferiorMovil>> = {}) {
  const alAbrirMas = vi.fn();
  render(
    <BarraInferiorMovil
      idActivo="hoy"
      pathname="/"
      contadorHoy={null}
      masAbierta={false}
      alAbrirMas={alAbrirMas}
      {...propiedades}
    />,
  );
  return { alAbrirMas, nav: screen.getByRole('navigation', { name: 'Navegación móvil inferior' }) };
}

describe('BarraInferiorMovil (T-320, variante B)', () => {
  it('tiene exactamente 5 sitios, en orden: Hoy, Conversaciones, Cotizar, Archivos, Más', () => {
    const { nav } = pintar();
    const hijos = Array.from(nav.children).map((e) => e.textContent);
    expect(hijos).toEqual(['Hoy', 'Conversaciones', 'Cotizar', 'Archivos', 'Más']);
  });

  it('las rutas salen de la tabla: Cotizar abre el cotizador en blanco', () => {
    const { nav } = pintar();
    const href = (nombre: string) =>
      within(nav).getByRole('link', { name: nombre }).getAttribute('href');
    expect(href('Hoy')).toBe('/');
    expect(href('Conversaciones')).toBe('/bandeja');
    expect(href('Cotizar')).toBe('/cotizador');
    expect(href('Archivos de viaje')).toBe('/viajes');
  });

  it('no hay pestaña de búsqueda ni de perfil', () => {
    const { nav } = pintar();
    expect(within(nav).queryByText('Buscar')).toBeNull();
    expect(within(nav).queryByText('Perfil')).toBeNull();
  });

  it('cada sitio mide al menos 44 px y la etiqueta nunca baja de 11 px', () => {
    const { nav } = pintar();
    for (const el of Array.from(nav.children)) {
      expect(el.className).toContain('min-h-[44px]');
      expect(el.className).toContain('flex-1');
    }
    const etiquetas = Array.from(nav.querySelectorAll('span.whitespace-nowrap'));
    expect(etiquetas).toHaveLength(5);
    for (const e of etiquetas) {
      expect(e.className).toContain('text-[11px]');
    }
  });

  it('marca un solo sitio como página actual', () => {
    const { nav } = pintar({ idActivo: 'conversaciones', pathname: '/bandeja' });
    const actuales = nav.querySelectorAll('[aria-current="page"]');
    expect(actuales).toHaveLength(1);
    expect(actuales[0]?.getAttribute('aria-label')).toBe('Conversaciones');
  });

  it('Cotizar es la actual en /cotizador (donde el módulo activo es Cotizaciones)', () => {
    const { nav } = pintar({ idActivo: 'cotizaciones', pathname: '/cotizador' });
    const actuales = nav.querySelectorAll('[aria-current="page"]');
    expect(actuales).toHaveLength(1);
    expect(actuales[0]?.getAttribute('aria-label')).toBe('Cotizar');
  });

  it('un módulo de la hoja resalta «Más» sin marcarlo como página actual', () => {
    const { nav } = pintar({ idActivo: 'oportunidades', pathname: '/pipeline' });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    expect(screen.getByTestId('barra-boton-mas').getAttribute('data-resaltado')).toBe('true');
  });

  it('en Hoy sale el contador de pendientes y su nombre accesible; sin dato, nada', () => {
    pintar({ contadorHoy: 4 });
    expect(screen.getByTestId('contador-barra-hoy').textContent).toBe('4');
    expect(screen.getByRole('link', { name: 'Hoy, 4 pendientes' })).toBeDefined();
    cleanup();
    pintar({ contadorHoy: null });
    expect(screen.queryByTestId('contador-barra-hoy')).toBeNull();
    cleanup();
    pintar({ contadorHoy: 150 });
    expect(screen.getByTestId('contador-barra-hoy').textContent).toBe('99+');
  });

  it('no hay contador en Conversaciones: ese dato no llega al marco sin una llamada nueva', () => {
    pintar({ contadorHoy: 3 });
    expect(screen.queryByTestId('contador-barra-conversaciones')).toBeNull();
  });

  it('«Más» avisa que abre un diálogo y lo abre al pulsarlo', () => {
    const { alAbrirMas } = pintar();
    const mas = screen.getByRole('button', { name: 'Más' });
    expect(mas.getAttribute('aria-haspopup')).toBe('dialog');
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(mas);
    expect(alAbrirMas).toHaveBeenCalledTimes(1);
  });

  it('«Más» refleja la hoja abierta con aria-expanded', () => {
    pintar({ masAbierta: true });
    expect(screen.getByRole('button', { name: 'Más' }).getAttribute('aria-expanded')).toBe('true');
  });
});
