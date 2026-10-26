import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FormularioIngreso } from './formulario-ingreso';
import * as authApi from '../../lib/auth-api';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
  }),
}));

describe('FormularioIngreso (0c.29)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza formulario de credenciales por defecto con campos accesibles', () => {
    render(<FormularioIngreso />);

    expect(screen.getByRole('heading', { level: 1, name: /viajapro/i })).toBeDefined();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeDefined();
    expect(screen.getByLabelText(/^contraseña$/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /ingresar a viajapro/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /ingresar con código de 6 dígitos por correo/i }),
    ).toBeDefined();
  });

  it('permite alternar la visibilidad de la contraseña con botón accesible', () => {
    render(<FormularioIngreso />);

    const botonToggle = screen.getByRole('button', { name: /mostrar contraseña/i });
    const inputClave = screen.getByLabelText<HTMLInputElement>(/^contraseña$/i);

    expect(inputClave.type).toBe('password');

    fireEvent.click(botonToggle);
    expect(inputClave.type).toBe('text');
    expect(screen.getByRole('button', { name: /ocultar contraseña/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /ocultar contraseña/i }));
    expect(inputClave.type).toBe('password');
  });

  it('muestra alerta accesible con role="alert" ante error de credenciales', async () => {
    vi.spyOn(authApi, 'iniciarSesionApi').mockRejectedValueOnce(
      new authApi.AuthApiError(
        'CREDENCIALES_INVALIDAS',
        'Correo o contraseña incorrectos. Verifica tus credenciales.',
        401,
      ),
    );

    render(<FormularioIngreso />);

    const botonIngresar = screen.getByRole('button', { name: /ingresar a viajapro/i });
    fireEvent.click(botonIngresar);

    await waitFor(() => {
      const alerta = screen.getByRole('alert');
      expect(alerta).toBeDefined();
      expect(alerta.getAttribute('aria-live')).toBe('assertive');
      expect(alerta.textContent).toContain('Correo o contraseña incorrectos');
    });
  });

  it('muestra estado de éxito y navega a /bandeja tras ingreso correcto con agencia única', async () => {
    vi.spyOn(authApi, 'iniciarSesionApi').mockResolvedValueOnce({
      identidad: {
        id: '01932000-0000-7000-8000-000000000001',
        correo: 'asesor@viajapro.com',
        nombre: 'Asesor Real',
      },
      agencias: [
        {
          id: '01932000-0000-7000-8000-00000000000a',
          nombre: 'Viajes El Sol',
          slug: 'viajes-el-sol',
        },
      ],
      tenantActivoId: '01932000-0000-7000-8000-00000000000a',
      acceso: {
        usuarioId: '01932000-0000-7000-8000-000000000011',
        rol: 'Asesor',
        permisos: ['conversaciones.ver_todas'],
      },
    });

    render(<FormularioIngreso />);

    const botonIngresar = screen.getByRole('button', { name: /ingresar a viajapro/i });
    fireEvent.click(botonIngresar);

    await waitFor(() => {
      expect(screen.getByText(/ingreso exitoso. redirigiendo/i)).toBeDefined();
    });

    await waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith('/bandeja');
      },
      { timeout: 1000 },
    );
  });

  it('transiciona a selector de agencia cuando la sesión tiene más de una agencia sin fijar', async () => {
    vi.spyOn(authApi, 'iniciarSesionApi').mockResolvedValueOnce({
      identidad: {
        id: '01932000-0000-7000-8000-000000000002',
        correo: 'multi@viajapro.com',
        nombre: 'Ana Dueña',
      },
      agencias: [
        {
          id: '01932000-0000-7000-8000-00000000000a',
          nombre: 'Viajes El Sol',
          slug: 'viajes-el-sol',
        },
        {
          id: '01932000-0000-7000-8000-00000000000b',
          nombre: 'Turismo Caribe SAS',
          slug: 'turismo-caribe',
        },
      ],
      tenantActivoId: null,
      acceso: null,
    });

    render(<FormularioIngreso />);

    const botonIngresar = screen.getByRole('button', { name: /ingresar a viajapro/i });
    fireEvent.click(botonIngresar);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /selecciona una agencia/i }),
      ).toBeDefined();
      expect(screen.getByText('Viajes El Sol')).toBeDefined();
      expect(screen.getByText('Turismo Caribe SAS')).toBeDefined();
    });
  });

  it('permite seleccionar una agencia y navegar a la bandeja', async () => {
    vi.spyOn(authApi, 'iniciarSesionApi').mockResolvedValueOnce({
      identidad: {
        id: '01932000-0000-7000-8000-000000000002',
        correo: 'multi@viajapro.com',
        nombre: 'Ana Dueña',
      },
      agencias: [
        {
          id: '01932000-0000-7000-8000-00000000000a',
          nombre: 'Viajes El Sol',
          slug: 'viajes-el-sol',
        },
        {
          id: '01932000-0000-7000-8000-00000000000b',
          nombre: 'Turismo Caribe SAS',
          slug: 'turismo-caribe',
        },
      ],
      tenantActivoId: null,
      acceso: null,
    });

    const cambiarAgenciaSpy = vi.spyOn(authApi, 'cambiarAgenciaActivaApi').mockResolvedValueOnce({
      identidad: {
        id: '01932000-0000-7000-8000-000000000002',
        correo: 'multi@viajapro.com',
        nombre: 'Ana Dueña',
      },
      agencias: [
        {
          id: '01932000-0000-7000-8000-00000000000a',
          nombre: 'Viajes El Sol',
          slug: 'viajes-el-sol',
        },
      ],
      tenantActivoId: '01932000-0000-7000-8000-00000000000a',
      acceso: {
        usuarioId: '01932000-0000-7000-8000-000000000099',
        rol: 'DUENO',
        permisos: ['conversaciones.ver_todas'],
      },
    });

    render(<FormularioIngreso />);

    fireEvent.click(screen.getByRole('button', { name: /ingresar a viajapro/i }));

    await waitFor(() => {
      expect(screen.getByText('Viajes El Sol')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Viajes El Sol'));

    expect(cambiarAgenciaSpy).toHaveBeenCalledWith('01932000-0000-7000-8000-00000000000a');

    await waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith('/bandeja');
      },
      { timeout: 1000 },
    );
  });

  it('permite cambiar a la interfaz de código OTP y volver a credenciales', () => {
    render(<FormularioIngreso />);

    const botonIrAOtp = screen.getByRole('button', {
      name: /ingresar con código de 6 dígitos por correo/i,
    });
    fireEvent.click(botonIrAOtp);

    // Debe mostrar el aviso de Rebanada 4
    expect(screen.getByText(/próximamente/i)).toBeDefined();
    expect(screen.getByLabelText(/código de 6 dígitos/i)).toBeDefined();

    // Volver a contraseña
    const botonVolver = screen.getByRole('button', { name: /volver al ingreso con contraseña/i });
    fireEvent.click(botonVolver);

    expect(screen.getByLabelText(/^contraseña$/i)).toBeDefined();
  });
});
