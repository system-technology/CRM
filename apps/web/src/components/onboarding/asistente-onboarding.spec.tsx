import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AsistenteOnboarding } from './asistente-onboarding';

describe('AsistenteOnboarding — Orquestador de 4 Pasos (T-105)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('1. Renderiza los 4 pasos en el stepper con distintivo T-105', () => {
    render(<AsistenteOnboarding tenantId="tenant-test" nombreAgencia="Caribe Tours" />);

    expect(screen.getByText('T-105')).toBeDefined();
    expect(screen.getByText('Bienvenido a ViajaPro: Configura tu Agencia')).toBeDefined();
    expect(screen.getByTestId('btn-paso-marca')).toBeDefined();
    expect(screen.getByTestId('btn-paso-catalogo')).toBeDefined();
    expect(screen.getByTestId('btn-paso-equipo')).toBeDefined();
    expect(screen.getByTestId('btn-paso-whatsapp')).toBeDefined();
  });

  it('2. Permite avanzar de Paso 1 a Paso 2 al guardar la marca', () => {
    render(<AsistenteOnboarding tenantId="tenant-test" nombreAgencia="Caribe Tours" />);

    const btnGuardarMarca = screen.getByTestId('btn-guardar-paso-marca');
    fireEvent.click(btnGuardarMarca);

    // Debe mostrar la vista de catálogo (Paso 2)
    expect(screen.getByTestId('paso-catalogo-form')).toBeDefined();
  });

  it('3. Permite omitir un paso y avanzar al siguiente', () => {
    render(<AsistenteOnboarding tenantId="tenant-test" nombreAgencia="Caribe Tours" />);

    // Omitir marca
    const btnOmitir = screen.getByTestId('btn-omitir-paso-marca');
    fireEvent.click(btnOmitir);

    // Avanza a catálogo
    expect(screen.getByTestId('paso-catalogo-form')).toBeDefined();
  });

  it('4. Al completar los 4 pasos, muestra la pantalla de resumen y el botón de primera cotización', () => {
    const alFinalizar = vi.fn();
    render(
      <AsistenteOnboarding
        tenantId="tenant-test"
        nombreAgencia="Caribe Tours"
        alFinalizar={alFinalizar}
      />,
    );

    // Paso 1: Marca
    fireEvent.click(screen.getByTestId('btn-guardar-paso-marca'));
    // Paso 2: Catálogo
    fireEvent.click(screen.getByTestId('btn-guardar-paso-catalogo'));
    // Paso 3: Equipo
    fireEvent.click(screen.getByTestId('btn-guardar-paso-equipo'));
    // Paso 4: WhatsApp
    fireEvent.click(screen.getByTestId('btn-guardar-paso-whatsapp'));

    expect(alFinalizar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('resumen-onboarding-completado')).toBeDefined();
    expect(screen.getByTestId('btn-crear-primera-cotizacion')).toBeDefined();
  });

  it('5. El botón de reiniciar restablece el asistente al Paso 1', () => {
    render(<AsistenteOnboarding tenantId="tenant-test" nombreAgencia="Caribe Tours" />);

    // Avanzar a paso 2
    fireEvent.click(screen.getByTestId('btn-guardar-paso-marca'));
    expect(screen.getByTestId('paso-catalogo-form')).toBeDefined();

    // Clic en reiniciar
    const btnReiniciar = screen.getByTitle('Restablecer asistente');
    fireEvent.click(btnReiniciar);

    // Vuelve a paso 1
    expect(screen.getByTestId('paso-marca-form')).toBeDefined();
  });
});
