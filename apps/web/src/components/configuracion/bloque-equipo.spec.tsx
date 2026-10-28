import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BloqueEquipo } from './bloque-equipo';
import * as equipoApi from '../../lib/equipo-api';

describe('BloqueEquipo (T-027)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('viajapro_modo_demo', 'true');
    vi.restoreAllMocks();
  });

  it('renderiza el listado de miembros y las tarjetas de resumen', async () => {
    render(<BloqueEquipo />);

    await waitFor(() => {
      expect(screen.getByText(/Equipo y Permisos de la Agencia/i)).toBeDefined();
    });

    expect(screen.getByText(/Total Usuarios/i)).toBeDefined();
    expect(screen.getByText(/Dueños Activos/i)).toBeDefined();
    expect(screen.getByText(/Asesores Activos/i)).toBeDefined();
    await waitFor(() => {
      expect(screen.getAllByText(/Alejandro Morales/i).length).toBeGreaterThan(0);
    });
  });

  it('abre el modal para invitar y permite cerrarlo', async () => {
    render(<BloqueEquipo />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invitar Asesor/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Invitar Asesor/i }));
    expect(screen.getByText(/Invitar Asesor a la Agencia/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.queryByText(/Invitar Asesor a la Agencia/i)).toBeNull();
  });

  it('muestra error con «Qué hacer» cuando la API responde con límite de envíos (DEMASIADOS_INTENTOS)', async () => {
    vi.spyOn(equipoApi, 'invitarMiembroApi').mockRejectedValueOnce({
      codigo: 'DEMASIADOS_INTENTOS',
      mensaje: 'Se ha excedido el límite de envíos de invitaciones permitidas.',
      queHacer:
        'Espera 10 minutos antes de intentar invitar nuevamente para proteger tu reputación.',
    });

    render(<BloqueEquipo />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invitar Asesor/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Invitar Asesor/i }));

    const inputEmail = screen.getByLabelText(/Correo Electrónico/i);
    fireEvent.change(inputEmail, { target: { value: 'bloqueado@agencia.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Enviar Invitación/i }));

    await waitFor(() => {
      expect(screen.getByText(/límite de envíos/i)).toBeDefined();
      expect(screen.getByText(/Espera 10 minutos antes de intentar invitar/i)).toBeDefined();
    });
  });

  it('muestra error con «Qué hacer» cuando la API responde con código o invitación inválida', async () => {
    vi.spyOn(equipoApi, 'invitarMiembroApi').mockRejectedValueOnce({
      codigo: 'CODIGO_INVALIDO',
      mensaje: 'El código de invitación o activación ya fue utilizado o ha caducado.',
      queHacer: 'Genera una nueva invitación por correo para este asesor.',
    });

    render(<BloqueEquipo />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invitar Asesor/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Invitar Asesor/i }));

    const inputEmail = screen.getByLabelText(/Correo Electrónico/i);
    fireEvent.change(inputEmail, { target: { value: 'reutilizado@agencia.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Enviar Invitación/i }));

    await waitFor(() => {
      expect(screen.getByText(/ya fue utilizado o ha caducado/i)).toBeDefined();
      expect(screen.getByText(/Genera una nueva invitación por correo/i)).toBeDefined();
    });
  });

  it('permite enviar una invitación exitosa y muestra la confirmación verde', async () => {
    vi.spyOn(equipoApi, 'invitarMiembroApi').mockResolvedValueOnce({ ok: true });

    render(<BloqueEquipo />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invitar Asesor/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Invitar Asesor/i }));

    const inputEmail = screen.getByLabelText(/Correo Electrónico/i);
    fireEvent.change(inputEmail, { target: { value: 'nuevo.exitoso@agencia.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Enviar Invitación/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invitación despachada a nuevo.exitoso@agencia.com/i)).toBeDefined();
    });
  });
});
