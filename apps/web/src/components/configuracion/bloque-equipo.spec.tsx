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
      expect(screen.getAllByText(/Alejandro Morales/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Equipo y Permisos de la Agencia/i).textContent).toMatch(
      /^Equipo y Permisos de la Agencia/,
    );
    const valorTarjeta = (etiqueta: RegExp) =>
      screen.getByText(etiqueta).nextElementSibling?.textContent;
    const filasMiembros = screen.getAllByRole('row').length - 1; // menos la cabecera
    expect(filasMiembros).toBeGreaterThan(0);
    expect(valorTarjeta(/Total Usuarios/i)).toBe(String(filasMiembros));
    expect(valorTarjeta(/Dueños Activos/i)).toMatch(/^\d+$/);
    expect(valorTarjeta(/Asesores Activos/i)).toMatch(/^\d+$/);
    expect(
      Number(valorTarjeta(/Dueños Activos/i)) + Number(valorTarjeta(/Asesores Activos/i)),
    ).toBeLessThanOrEqual(filasMiembros);
  });

  it('abre el modal para invitar y permite cerrarlo', async () => {
    render(<BloqueEquipo />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Invitar Asesor/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Invitar Asesor/i }));
    expect(screen.getByText(/Invitar Asesor a la Agencia/i).textContent).toBe(
      'Invitar Asesor a la Agencia',
    );

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
      expect(screen.getByText(/límite de envíos/i).textContent).toBe(
        'Se ha excedido el límite de envíos de invitaciones permitidas.',
      );
      expect(screen.getByText(/Espera 10 minutos antes de intentar invitar/i).textContent).toBe(
        'Qué hacer: Espera 10 minutos antes de intentar invitar nuevamente para proteger tu reputación.',
      );
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
      expect(
        screen.getByText(/Invitación despachada a nuevo.exitoso@agencia.com/i).textContent,
      ).toMatch(/^Invitación despachada a nuevo\.exitoso@agencia\.com/);
    });
  });

  describe('modo real', () => {
    beforeEach(() => {
      localStorage.removeItem('viajapro_modo_demo');
    });

    it('403: muestra «no tienes permiso para ver el equipo» y no usa el mock', async () => {
      vi.spyOn(equipoApi, 'listarMiembrosEquipoApi').mockRejectedValueOnce(
        new equipoApi.ErrorMiembrosApi('PERMISO_DENEGADO', 'x', 403),
      );
      render(<BloqueEquipo />);
      await waitFor(() => {
        expect(screen.getByTestId('equipo-sin-permiso').getAttribute('role')).toBe('alert');
      });
      expect(screen.getByText(/No tienes permiso para ver el equipo/i).textContent).toBe(
        'No tienes permiso para ver el equipo.',
      );
      expect(screen.getByTestId('equipo-sin-permiso').textContent).toContain(
        'usuarios.administrar',
      );
      expect(screen.queryByText(/Alejandro Morales/i)).toBeNull();
    });

    it('error de red: mensaje y reintento', async () => {
      vi.spyOn(equipoApi, 'listarMiembrosEquipoApi').mockRejectedValueOnce(
        new equipoApi.ErrorMiembrosApi('ERROR_CONEXION', 'No fue posible conectar.'),
      );
      render(<BloqueEquipo />);
      await waitFor(() => {
        expect(screen.getByTestId('equipo-error').textContent).toContain(
          'No se pudo cargar el equipo.No fue posible conectar.',
        );
      });
      expect(screen.getByRole('button', { name: /Reintentar/i }).textContent).toBe('Reintentar');
    });

    it('lista vacía real: estado vacío, sin mock', async () => {
      vi.spyOn(equipoApi, 'listarMiembrosEquipoApi').mockResolvedValueOnce([]);
      render(<BloqueEquipo />);
      await waitFor(() => {
        expect(screen.getByText(/No hay miembros registrados/i).textContent).toBe(
          'No hay miembros registrados en la agencia.',
        );
      });
    });

    it('muestra rol propio por nombre y no pide teléfono al invitar', async () => {
      vi.spyOn(equipoApi, 'listarMiembrosEquipoApi').mockResolvedValueOnce([
        {
          id: '1',
          nombre: 'Laura Restrepo',
          email: 'laura@agencia.co',
          apodo: null,
          rolClave: null,
          rolNombre: 'Coordinadora de grupos',
          estado: 'ACTIVO',
          fechaIngreso: '2026-10-01T15:00:00.000Z',
          avatarIniciales: 'LR',
        },
      ]);
      render(<BloqueEquipo />);
      await waitFor(() => {
        expect(screen.getByText('Coordinadora de grupos').closest('tr')?.textContent).toContain(
          'Laura Restrepo',
        );
      });
      expect(screen.getByText('LR').closest('tr')?.textContent).toContain('laura@agencia.co');
      fireEvent.click(screen.getByRole('button', { name: /Invitar Asesor/i }));
      expect(screen.queryByLabelText(/Teléfono WhatsApp/i)).toBeNull();
    });
  });
  describe('usuario de ingreso (ADR-0031)', () => {
    const abrir = async () => {
      render(<BloqueEquipo />);
      await waitFor(() => {
        expect(
          screen.getAllByRole('button', { name: /Editar usuario de/i }).length,
        ).toBeGreaterThan(0);
      });
      const boton = screen.getAllByRole('button', { name: /Editar usuario de/i })[0];
      if (!boton) throw new Error('sin boton');
      fireEvent.click(boton);
    };

    it('guarda el usuario y avisa sin jerga', async () => {
      const espia = vi.spyOn(equipoApi, 'cambiarApodoMiembroApi').mockResolvedValueOnce();
      await abrir();
      fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'ialvear' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => {
        expect(screen.getByText(/ya puede entrar con su usuario/)).toBeDefined();
      });
      expect(espia).toHaveBeenCalledWith(expect.any(String), 'ialvear');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('con el usuario vacio lo quita (null)', async () => {
      const espia = vi.spyOn(equipoApi, 'cambiarApodoMiembroApi').mockResolvedValueOnce();
      await abrir();
      fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: '  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => expect(espia).toHaveBeenCalledWith(expect.any(String), null));
    });

    it('un 409 muestra un mensaje claro y deja el dialogo abierto', async () => {
      vi.spyOn(equipoApi, 'cambiarApodoMiembroApi').mockRejectedValueOnce(
        new equipoApi.ErrorMiembrosApi(
          'APODO_NO_DISPONIBLE',
          equipoApi.mensajeDeErrorDeApodo(409, 'APODO_NO_DISPONIBLE'),
          409,
        ),
      );
      await abrir();
      fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'ocupado' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => {
        expect(screen.getByTestId('error-usuario-de-ingreso').textContent).toMatch(
          /ya está en uso/,
        );
      });
      expect(screen.getByRole('dialog')).toBeDefined();
    });
  });
});
