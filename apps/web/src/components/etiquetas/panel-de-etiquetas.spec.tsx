import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Etiqueta } from '@viajapro/contracts';
import { PanelDeEtiquetas } from './panel-de-etiquetas';
import type { CatalogoDeEtiquetas } from '../../lib/use-catalogo-de-etiquetas';

const E = (n: number, nombre: string, orden = n): Etiqueta => ({
  id: `00000000-0004-4000-8000-0000000000${n.toString(16).padStart(2, '0')}`,
  nombre,
  color: 'azul',
  orden,
});

function catalogo(parcial: Partial<CatalogoDeEtiquetas>): CatalogoDeEtiquetas {
  return {
    estado: 'listo',
    etiquetas: [E(1, 'Pagado'), E(2, 'Pago pendiente'), E(3, 'Seguimiento')],
    recargando: false,
    error: false,
    recargar: vi.fn().mockResolvedValue(undefined),
    reemplazar: vi.fn(),
    ...parcial,
  };
}

function montar(
  cat: CatalogoDeEtiquetas,
  extra: Partial<React.ComponentProps<typeof PanelDeEtiquetas>> = {},
) {
  const props = {
    titulo: 'Etiquetas',
    catalogo: cat,
    seleccionadas: new Set<string>(),
    onAlternar: vi.fn(),
    onCerrar: vi.fn(),
    puedeAdministrar: false,
    ...extra,
  };
  render(
    <>
      <button type="button">disparador</button>
      <PanelDeEtiquetas {...props} />
    </>,
  );
  return props;
}

describe('PanelDeEtiquetas: estados (HU-inbox-1 §4.5)', () => {
  it('cargando: esqueleto, nunca un spinner centrado', () => {
    montar(catalogo({ estado: 'cargando', etiquetas: [] }));
    expect(screen.getByTestId('panel-de-etiquetas-cargando')).toBeDefined();
    expect(screen.getByText('Cargando etiquetas…')).toBeDefined();
    expect(screen.queryAllByTestId('opcion-de-etiqueta')).toHaveLength(0);
  });

  it('error: dice qué pasó y reintenta', () => {
    const cat = catalogo({ estado: 'error', etiquetas: [], error: true });
    montar(cat);
    expect(
      screen.getByText('No se pudieron cargar las etiquetas. Revisa tu conexión.'),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(cat.recargar).toHaveBeenCalledTimes(1);
  });

  it('vacío con permiso de gestión: «Crear etiqueta»', () => {
    montar(catalogo({ etiquetas: [] }), { puedeAdministrar: true });
    expect(screen.getByText('Tu agencia no tiene etiquetas.')).toBeDefined();
    const crear = screen.getByRole('link', { name: 'Crear etiqueta' });
    expect(crear.getAttribute('href')).toBe('/configuracion?pestana=etiquetas');
  });

  it('vacío sin permiso: pide a quien administra y no ofrece gestionar', () => {
    montar(catalogo({ etiquetas: [] }), { puedeAdministrar: false });
    expect(screen.getByText('Pídele a quien administra la agencia que cree una.')).toBeDefined();
    expect(screen.queryByRole('link', { name: /etiqueta/i })).toBeNull();
  });

  it('«Gestionar etiquetas» solo con etiquetas.administrar', () => {
    montar(catalogo({}), { puedeAdministrar: true });
    expect(screen.getByRole('link', { name: 'Gestionar etiquetas' })).toBeDefined();
  });

  it('sin permiso de gestión no aparece «Gestionar etiquetas»', () => {
    montar(catalogo({}), { puedeAdministrar: false });
    expect(screen.queryByRole('link', { name: 'Gestionar etiquetas' })).toBeNull();
  });
});

describe('PanelDeEtiquetas: lista accesible', () => {
  it('cada opción es menuitemcheckbox con aria-checked', () => {
    const cat = catalogo({});
    montar(cat, { seleccionadas: new Set([(cat.etiquetas[1] as Etiqueta).id]) });
    const opciones = screen.getAllByRole('menuitemcheckbox');
    expect(opciones).toHaveLength(3);
    expect(opciones.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(screen.getByRole('menu', { name: 'Etiquetas' })).toBeDefined();
  });

  it('las filas miden 48 px en móvil', () => {
    montar(catalogo({}));
    for (const o of screen.getAllByRole('menuitemcheckbox')) {
      expect(o.className).toContain('min-h-[48px]');
    }
  });

  it('un toque alterna la etiqueta', () => {
    const props = montar(catalogo({}));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Seguimiento/ }));
    expect(props.onAlternar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Seguimiento' }),
    );
  });

  it('las flechas mueven el foco entre opciones (roving tabindex), Home y End a los extremos', () => {
    montar(catalogo({}));
    const opciones = screen.getAllByRole('menuitemcheckbox');
    opciones[0]?.focus();
    expect(opciones.map((o) => o.tabIndex)).toEqual([0, -1, -1]);
    fireEvent.keyDown(opciones[0] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opciones[1]);
    fireEvent.keyDown(opciones[1] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(opciones[2]);
    fireEvent.keyDown(opciones[2] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(opciones[1]);
    fireEvent.keyDown(opciones[1] as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(opciones[0]);
  });

  it('Esc cierra y las teclas del selector no llegan a los atajos de la lista o del chat', () => {
    const alAtajo = vi.fn();
    window.addEventListener('keydown', alAtajo);
    const props = montar(catalogo({}));
    const opcion = screen.getAllByRole('menuitemcheckbox')[0] as HTMLElement;
    fireEvent.keyDown(opcion, { key: 'j' });
    expect(alAtajo).not.toHaveBeenCalled();
    fireEvent.keyDown(opcion, { key: 'Escape' });
    expect(props.onCerrar).toHaveBeenCalled();
    window.removeEventListener('keydown', alAtajo);
  });

  it('«Listo» cierra', () => {
    const props = montar(catalogo({}));
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(props.onCerrar).toHaveBeenCalledTimes(1);
  });

  it('con muchas etiquetas aparece el buscador y filtra', () => {
    const muchas = Array.from({ length: 9 }, (_, i) =>
      E(i + 1, i === 4 ? 'Luna de miel' : `Etiqueta ${i}`),
    );
    montar(catalogo({ etiquetas: muchas }));
    fireEvent.change(screen.getByLabelText('Buscar etiqueta'), { target: { value: 'luna' } });
    const opciones = screen.getAllByRole('menuitemcheckbox');
    expect(opciones).toHaveLength(1);
    expect(opciones[0]?.textContent).toContain('Luna de miel');
    fireEvent.change(screen.getByLabelText('Buscar etiqueta'), { target: { value: 'zzz' } });
    expect(screen.getByText('Ninguna etiqueta coincide con la búsqueda.')).toBeDefined();
  });

  it('con pocas etiquetas no hay buscador', () => {
    montar(catalogo({}));
    expect(screen.queryByLabelText('Buscar etiqueta')).toBeNull();
  });

  it('marca la fila ocupada mientras espera al servidor', () => {
    const cat = catalogo({});
    montar(cat, { pendientes: new Set([(cat.etiquetas[0] as Etiqueta).id]) });
    expect(screen.getAllByRole('menuitemcheckbox')[0]?.getAttribute('aria-busy')).toBe('true');
  });
});
