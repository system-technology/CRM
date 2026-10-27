import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalBusquedaGlobal } from '../busqueda/modal-busqueda-global';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('ModalBusquedaGlobal / PaletaComandos (Ctrl+K)', () => {
  const alCerrar = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no renderiza nada cuando abierto=false', () => {
    const { container } = render(<ModalBusquedaGlobal abierto={false} alCerrar={alCerrar} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la paleta con input, kbd badges y chips temáticos', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={alCerrar} />);

    expect(screen.getByTestId('modal-busqueda-global')).toBeDefined();
    const input = screen.getByTestId('input-paleta-comandos');
    expect(input).toBeDefined();

    expect(screen.getByRole('tab', { name: 'Todos' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Módulos' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Cotizaciones' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Excursiones' })).toBeDefined();

    expect(screen.getByText('Navegar')).toBeDefined();
    expect(screen.getByText('Seleccionar')).toBeDefined();
    expect(screen.getByText('Cerrar')).toBeDefined();
  });

  it('permite buscar y filtrar resultados en tiempo real', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={alCerrar} />);

    const input = screen.getByTestId('input-paleta-comandos');
    fireEvent.change(input, { target: { value: 'Islas' } });

    const coincidencias = screen.getAllByText(/Pasadía Islas del Rosario/i);
    expect(coincidencias.length).toBeGreaterThan(0);
  });

  it('permite filtrar por chip temático', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={alCerrar} />);

    const tabCotizaciones = screen.getByRole('tab', { name: 'Cotizaciones' });
    fireEvent.click(tabCotizaciones);

    expect(screen.getByText('Cotizaciones de Viaje')).toBeDefined();
  });

  it('navega con teclado (ArrowDown, Enter) y abre la ruta seleccionada', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={alCerrar} />);

    const dialog = screen.getByTestId('modal-busqueda-global');
    // Navegar abajo
    fireEvent.keyDown(dialog, { key: 'ArrowDown', code: 'ArrowDown' });
    // Seleccionar con Enter
    fireEvent.keyDown(dialog, { key: 'Enter', code: 'Enter' });

    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalled();
  });

  it('cierra la paleta al hacer clic en el telón de fondo', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={alCerrar} />);

    const dialog = screen.getByTestId('modal-busqueda-global');
    const telon = dialog.firstElementChild as HTMLElement;
    fireEvent.click(telon);

    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
