import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BloqueSeguimientosDia } from './bloque-seguimientos-dia';
import type { PendientesDelDia } from '@viajapro/contracts';

const MOCK_PENDIENTES: PendientesDelDia = {
  fecha: '2026-10-27',
  vencidos: [
    {
      id: '01932000-0000-7000-8000-000000000071',
      descripcion: 'Confirmar pago de anticipo $2.500.000 San Andrés',
      venceEn: '2026-10-26T15:00:00.000Z',
      completadoEn: null,
      asesorId: '01932000-0000-7000-8000-000000000011',
      asesorNombre: 'Laura Gómez',
      contactoId: '01932000-0000-7000-8000-000000000021',
      contactoNombre: 'Laura Restrepo',
      oportunidadId: '01932000-0000-7000-8000-000000000031',
      oportunidadTitulo: 'Paquete San Andrés Decameron',
      conversacionId: '01932000-0000-7000-8000-000000000041',
    },
  ],
  deHoy: [
    {
      id: '01932000-0000-7000-8000-000000000072',
      descripcion: 'Enviar cotización formal Pasadía Bora Bora VIP',
      venceEn: '2026-10-27T16:00:00.000Z',
      completadoEn: null,
      asesorId: '01932000-0000-7000-8000-000000000011',
      asesorNombre: 'Laura Gómez',
      contactoId: '01932000-0000-7000-8000-000000000022',
      contactoNombre: 'Sofía Henao',
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: '01932000-0000-7000-8000-000000000042',
    },
  ],
};

describe('BloqueSeguimientosDia (T-020) - Compromisos diarios del asesor', () => {
  it('1. Renderiza estado cargando con esqueleto accesible', () => {
    render(<BloqueSeguimientosDia pendientes={null} cargando={true} />);
    expect(screen.getByTestId('seguimientos-cargando')).toBeDefined();
  });

  it('2. Renderiza estado vacío cuando no hay seguimientos pendientes', () => {
    render(
      <BloqueSeguimientosDia
        pendientes={{ fecha: '2026-10-27', vencidos: [], deHoy: [] }}
        cargando={false}
      />,
    );
    expect(screen.getByTestId('seguimientos-vacio')).toBeDefined();
    expect(screen.getByText(/¡Estás al día con tus seguimientos!/i)).toBeDefined();
  });

  it('3. Muestra alerta y badge de vencidos y lista los elementos', () => {
    render(<BloqueSeguimientosDia pendientes={MOCK_PENDIENTES} cargando={false} />);

    expect(screen.getByTestId('badge-alerta-vencidos')).toBeDefined();
    expect(screen.getByText(/1 vencido/i)).toBeDefined();

    expect(screen.getByText(/Confirmar pago de anticipo/i)).toBeDefined();
    expect(screen.getByText(/Laura Restrepo/i)).toBeDefined();
    expect(screen.getByText(/Paquete San Andrés Decameron/i)).toBeDefined();

    expect(screen.getByText(/Enviar cotización formal Pasadía Bora Bora/i)).toBeDefined();
    expect(screen.getByText(/Sofía Henao/i)).toBeDefined();
  });

  it('4. Filtra por pestaña vencidos y por hoy', () => {
    render(<BloqueSeguimientosDia pendientes={MOCK_PENDIENTES} cargando={false} />);

    // Click en vencidos
    fireEvent.click(screen.getByTestId('filtro-seguimientos-vencidos'));
    expect(screen.getByText(/Confirmar pago de anticipo/i)).toBeDefined();
    expect(screen.queryByText(/Enviar cotización formal Pasadía Bora Bora/i)).toBeNull();

    // Click en hoy
    fireEvent.click(screen.getByTestId('filtro-seguimientos-hoy'));
    expect(screen.queryByText(/Confirmar pago de anticipo/i)).toBeNull();
    expect(screen.getByText(/Enviar cotización formal Pasadía Bora Bora/i)).toBeDefined();
  });

  it('5. Al pulsar completar ejecuta la función callback con el ID respectivo', () => {
    const alCompletar = vi.fn().mockResolvedValue(undefined);
    render(
      <BloqueSeguimientosDia
        pendientes={MOCK_PENDIENTES}
        cargando={false}
        alCompletarSeguimiento={alCompletar}
      />,
    );

    const btnCompletar = screen.getByTestId('btn-completar-01932000-0000-7000-8000-000000000071');
    act(() => {
      fireEvent.click(btnCompletar);
    });

    expect(alCompletar).toHaveBeenCalledWith('01932000-0000-7000-8000-000000000071');
  });

  it('6. Tiene enlaces de acción directos a chat o pipeline con altura táctil >= 44px', () => {
    render(<BloqueSeguimientosDia pendientes={MOCK_PENDIENTES} cargando={false} />);

    const enlaceChat = screen.getByTestId('enlace-chat-01932000-0000-7000-8000-000000000071');
    expect(enlaceChat.getAttribute('href')).toBe('/bandeja/01932000-0000-7000-8000-000000000041');
    expect(enlaceChat.className).toContain('min-h-[44px]');
  });
});
