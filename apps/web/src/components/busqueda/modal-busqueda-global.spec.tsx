import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ModalBusquedaGlobal } from './modal-busqueda-global';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('ModalBusquedaGlobal — Paleta de Comandos (Ctrl+K) (T-034)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no renderiza nada cuando abierto es false', () => {
    const { container } = render(<ModalBusquedaGlobal abierto={false} alCerrar={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la paleta de comandos con input enfocado y pestañas temáticas', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);

    expect(screen.getByTestId('modal-paleta-comandos')).toBeDefined();
    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    expect(input).toBeDefined();

    expect(screen.getByTestId('filtro-categoria-todos')).toBeDefined();
    expect(screen.getByTestId('filtro-categoria-conversaciones')).toBeDefined();
    expect(screen.getByTestId('filtro-categoria-catalogo')).toBeDefined();
    expect(screen.getByTestId('filtro-categoria-cotizaciones')).toBeDefined();
    expect(screen.getByTestId('filtro-categoria-contactos')).toBeDefined();
  });

  it('permite filtrar resultados por pestaña temática con 1 clic', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);

    // Filtrar por cotizaciones
    const tabCotizaciones = screen.getByTestId('filtro-categoria-cotizaciones');
    fireEvent.click(tabCotizaciones);

    // Debe mostrar la sección de cotizaciones
    expect(screen.getAllByText(/Cotizaciones/i).length).toBeGreaterThan(0);
  });

  it('permite buscar y navegar a una cotización usando el teclado', () => {
    const alCerrar = vi.fn();
    render(<ModalBusquedaGlobal abierto={true} alCerrar={alCerrar} />);

    // Filtrar por cotizaciones para buscar específicamente cotizaciones
    const tabCotizaciones = screen.getByTestId('filtro-categoria-cotizaciones');
    fireEvent.click(tabCotizaciones);

    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    fireEvent.change(input, { target: { value: 'San Andrés' } });

    // Presionar Enter en la primera opción encontrada
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(alCerrar).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/cotizaciones/'));
  });

  it('permite navegar verticalmente con flechas arriba y abajo', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    fireEvent.change(input, { target: { value: 'San Andrés' } });

    // Flecha abajo para cambiar selección
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    const opciones = screen.getAllByRole('option');
    expect(opciones.length).toBeGreaterThan(0);
  });

  it('encuentra contactos al buscar por teléfono en el modal', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    fireEvent.change(input, { target: { value: '3000012345' } });

    expect(screen.getAllByText('Juan Pérez').length).toBeGreaterThan(0);
  });

  it('encuentra elementos por destino (ej. Cancún o San Andrés)', () => {
    render(<ModalBusquedaGlobal abierto={true} alCerrar={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Buscar contactos, chats/i);
    fireEvent.change(input, { target: { value: 'Cancún' } });

    const resultados = screen.getAllByRole('option');
    expect(resultados.length).toBeGreaterThan(0);
  });
});
