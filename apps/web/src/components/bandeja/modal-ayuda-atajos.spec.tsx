import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalAyudaAtajos } from './modal-ayuda-atajos';
import {
  CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA,
  fijarAtajosHabilitados,
} from '../../lib/atajos-teclado-bandeja';

describe('ModalAyudaAtajos (T-127)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('no renderiza nada si abierto es false', () => {
    const { container } = render(<ModalAyudaAtajos abierto={false} onCerrar={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza la lista de atajos y el diálogo accesible cuando está abierto', () => {
    render(<ModalAyudaAtajos abierto={true} onCerrar={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Atajos de teclado en la bandeja')).toBeDefined();
    expect(screen.getByText('Siguiente conversación')).toBeDefined();
    expect(screen.getByText('Conversación anterior')).toBeDefined();
    expect(screen.getByText('Enfocar compositor de mensaje')).toBeDefined();
    expect(screen.getByText('Abrir modal «Enviar cotización»')).toBeDefined();
    expect(screen.getByText('Crear seguimiento comercial')).toBeDefined();
    expect(screen.getByText('Mostrar ayuda de atajos de teclado')).toBeDefined();
  });

  it('permite alternar la preferencia de habilitación de atajos', () => {
    fijarAtajosHabilitados(true);
    render(<ModalAyudaAtajos abierto={true} onCerrar={vi.fn()} />);

    const switchBtn = screen.getByRole('switch', {
      name: /Alternar habilitación de atajos de teclado/i,
    });
    expect(switchBtn.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Activos')).toBeDefined();

    // Alternar a inactivos
    fireEvent.click(switchBtn);
    expect(localStorage.getItem(CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA)).toBe('false');
    expect(switchBtn.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Inactivos')).toBeDefined();
  });

  it('ejecuta onCerrar al hacer clic en el botón de cerrar y en Entendido', () => {
    const onCerrar = vi.fn();
    render(<ModalAyudaAtajos abierto={true} onCerrar={onCerrar} />);

    const botonCerrarX = screen.getByRole('button', { name: /Cerrar modal de ayuda/i });
    fireEvent.click(botonCerrarX);
    expect(onCerrar).toHaveBeenCalledTimes(1);

    const botonEntendido = screen.getByRole('button', { name: /Entendido/i });
    fireEvent.click(botonEntendido);
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });

  it('ejecuta onCerrar al presionar la tecla Escape', () => {
    const onCerrar = vi.fn();
    render(<ModalAyudaAtajos abierto={true} onCerrar={onCerrar} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
