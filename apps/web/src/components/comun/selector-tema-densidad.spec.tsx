import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectorTemaDensidad } from './selector-tema-densidad';
import { CLAVE_LOCALSTORAGE_TEMA, CLAVE_LOCALSTORAGE_DENSIDAD } from '../../lib/tema-y-densidad';

describe('Componente SelectorTemaDensidad (T-111)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-tema');
    document.documentElement.removeAttribute('data-tema-efectivo');
    document.documentElement.removeAttribute('data-densidad');
  });

  it('renderiza opciones de tema (claro, oscuro, sistema) y densidad (cómoda, compacta)', () => {
    render(<SelectorTemaDensidad />);

    expect(screen.getByRole('radiogroup', { name: /Seleccionar tema visual/i })).toBeDefined();
    expect(screen.getByTestId('opcion-tema-light')).toBeDefined();
    expect(screen.getByTestId('opcion-tema-dark')).toBeDefined();
    expect(screen.getByTestId('opcion-tema-system')).toBeDefined();

    expect(screen.getByRole('radiogroup', { name: /Seleccionar densidad visual/i })).toBeDefined();
    expect(screen.getByTestId('opcion-densidad-comoda')).toBeDefined();
    expect(screen.getByTestId('opcion-densidad-compacta')).toBeDefined();
  });

  it('permite cambiar a modo oscuro y persiste la selección', () => {
    const onCambioMock = vi.fn();
    render(<SelectorTemaDensidad onCambio={onCambioMock} />);

    const opcionDark = screen.getByTestId('opcion-tema-dark');
    fireEvent.click(opcionDark);

    expect(opcionDark.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(onCambioMock).toHaveBeenCalledWith('dark', 'comoda');
  });

  it('permite cambiar a modo claro y remueve la clase dark', () => {
    document.documentElement.classList.add('dark');
    render(<SelectorTemaDensidad />);

    const opcionLight = screen.getByTestId('opcion-tema-light');
    fireEvent.click(opcionLight);

    expect(opcionLight.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(CLAVE_LOCALSTORAGE_TEMA)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('permite alternar densidad a compacta y actualiza data-densidad', () => {
    const onCambioMock = vi.fn();
    render(<SelectorTemaDensidad onCambio={onCambioMock} />);

    const opcionCompacta = screen.getByTestId('opcion-densidad-compacta');
    fireEvent.click(opcionCompacta);

    expect(opcionCompacta.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(CLAVE_LOCALSTORAGE_DENSIDAD)).toBe('compacta');
    expect(document.documentElement.getAttribute('data-densidad')).toBe('compacta');
    expect(onCambioMock).toHaveBeenCalledWith('system', 'compacta');
  });

  it('los botones cuentan con área táctil accesible min-h-[44px]', () => {
    render(<SelectorTemaDensidad />);

    const botonLight = screen.getByTestId('opcion-tema-light');
    const botonDark = screen.getByTestId('opcion-tema-dark');
    const botonSystem = screen.getByTestId('opcion-tema-system');
    const botonComoda = screen.getByTestId('opcion-densidad-comoda');
    const botonCompacta = screen.getByTestId('opcion-densidad-compacta');

    expect(botonLight.className).toContain('min-h-[44px]');
    expect(botonDark.className).toContain('min-h-[44px]');
    expect(botonSystem.className).toContain('min-h-[44px]');
    expect(botonComoda.className).toContain('min-h-[44px]');
    expect(botonCompacta.className).toContain('min-h-[44px]');
  });
});
