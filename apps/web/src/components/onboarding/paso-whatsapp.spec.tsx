import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoWhatsApp } from './paso-whatsapp';
import { inicializarProgresoOnboarding } from '../../lib/onboarding-logica';

describe('PasoWhatsApp — Conexión WhatsApp Cloud API Segura (T-105)', () => {
  const datosIniciales = inicializarProgresoOnboarding('t-test').whatsapp;

  it('1. Renderiza el aviso de seguridad R6 y las opciones de conexión', () => {
    render(<PasoWhatsApp datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    expect(screen.getByText(/Regla R6: Máxima Seguridad y Privacidad Oficial/i)).toBeDefined();
    expect(screen.getByText('Modo Simulador de WhatsApp')).toBeDefined();
    expect(screen.getByText('Meta Cloud API Oficial (WABA)')).toBeDefined();
    expect(screen.getByText('Lista de Preparación para WhatsApp Cloud API')).toBeDefined();
  });

  it('2. Permite interactuar con los checkboxes de preparación', () => {
    render(<PasoWhatsApp datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    const checkMeta = screen.getByLabelText(/2\. Cuenta en Meta Business Suite/i);
    expect(checkMeta).toBeDefined();
    fireEvent.click(checkMeta);
  });

  it('3. Muestra la URL oficial del webhook de recepción para copiar', () => {
    render(<PasoWhatsApp datos={datosIniciales} alGuardar={vi.fn()} alOmitir={vi.fn()} />);

    expect(
      screen.getByDisplayValue('https://api.viajapro.com/v1/inbox/webhook/meta'),
    ).toBeDefined();
    expect(screen.getByText('Copiar')).toBeDefined();
  });

  it('4. Ejecuta alGuardar al finalizar el paso', () => {
    const alGuardar = vi.fn();
    render(<PasoWhatsApp datos={datosIniciales} alGuardar={alGuardar} alOmitir={vi.fn()} />);

    const btnFinalizar = screen.getByTestId('btn-guardar-paso-whatsapp');
    fireEvent.click(btnFinalizar);

    expect(alGuardar).toHaveBeenCalledTimes(1);
    expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        modo: 'simulador',
      }),
    );
  });

  it('5. Ejecuta alOmitir al hacer clic en Omitir y finalizar', () => {
    const alOmitir = vi.fn();
    render(<PasoWhatsApp datos={datosIniciales} alGuardar={vi.fn()} alOmitir={alOmitir} />);

    const btnOmitir = screen.getByTestId('btn-omitir-paso-whatsapp');
    fireEvent.click(btnOmitir);

    expect(alOmitir).toHaveBeenCalledTimes(1);
  });
});
