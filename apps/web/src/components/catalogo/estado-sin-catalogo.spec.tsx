import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EstadoSinCatalogo } from './estado-sin-catalogo';

describe('EstadoSinCatalogo (T-019)', () => {
  it('1. Renderiza el contenedor de estado sin catálogo y los dos botones de acción', () => {
    render(<EstadoSinCatalogo />);

    const contenedor = screen.getByTestId('estado-sin-catalogo');
    expect(contenedor).toBeDefined();

    const btnImportar = screen.getByTestId('btn-sin-catalogo-importar');
    expect(btnImportar).toBeDefined();
    expect(btnImportar.textContent).toContain('Importar catálogo (CSV)');

    const btnCrear = screen.getByTestId('btn-sin-catalogo-crear');
    expect(btnCrear).toBeDefined();
    expect(btnCrear.textContent).toContain('Crear excursión');
  });

  it('2. Ejecuta callbacks onImportar y onCrearExcursion al hacer clic', () => {
    const handleImportar = vi.fn();
    const handleCrear = vi.fn();

    render(<EstadoSinCatalogo onImportar={handleImportar} onCrearExcursion={handleCrear} />);

    const btnImportar = screen.getByTestId('btn-sin-catalogo-importar');
    fireEvent.click(btnImportar);
    expect(handleImportar).toHaveBeenCalledTimes(1);

    const btnCrear = screen.getByTestId('btn-sin-catalogo-crear');
    fireEvent.click(btnCrear);
    expect(handleCrear).toHaveBeenCalledTimes(1);
  });

  it('3. Muestra texto adaptado según el contexto (cotizador vs catalogo)', () => {
    const { rerender } = render(<EstadoSinCatalogo contexto="catalogo" />);
    expect(screen.getByText('Tu agencia aún no tiene catálogo publicado')).toBeDefined();

    rerender(<EstadoSinCatalogo contexto="cotizador" />);
    expect(
      screen.getByText('No hay excursiones ni salidas registradas en esta agencia'),
    ).toBeDefined();
  });
});
