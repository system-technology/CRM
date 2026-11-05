import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GuardaSesion } from './guarda-sesion';
import * as authApi from '../../lib/auth-api';

const replace = vi.fn();
let ruta = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => ruta,
  useRouter: () => ({ replace, push: vi.fn() }),
}));

describe('GuardaSesion (T-126)', () => {
  beforeEach(() => {
    replace.mockReset();
    ruta = '/';
    vi.stubEnv('NEXT_PUBLIC_USE_REAL_AUTH', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sin sesión redirige a /ingresar y no pinta el contenido', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockRejectedValue(
      new authApi.AuthApiError('SIN_SESION', 'x', 401),
    );
    render(
      <GuardaSesion>
        <p>contenido</p>
      </GuardaSesion>,
    );
    expect(screen.queryByText('contenido')).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?motivo=sesion_requerida'));
    expect(screen.queryByText('contenido')).toBeNull();
  });

  it('conserva la ruta pedida al redirigir', async () => {
    ruta = '/pipeline';
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockRejectedValue(
      new authApi.AuthApiError('SIN_SESION', 'x', 401),
    );
    render(<GuardaSesion>x</GuardaSesion>);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringContaining('%2Fpipeline')),
    );
  });

  it('con sesión válida muestra el contenido', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue({
      identidad: { id: '01932000-0000-7000-8000-000000000001', correo: 'a@b.co', nombre: 'A' },
      agencias: [],
      tenantActivoId: '01932000-0000-7000-8000-00000000000a',
      acceso: null,
    });
    render(<GuardaSesion>contenido</GuardaSesion>);
    expect(await screen.findByText('contenido')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('un fallo de red muestra error con reintento, no el contenido', async () => {
    vi.spyOn(authApi, 'obtenerSesionActualApi').mockRejectedValue(new Error('red'));
    render(<GuardaSesion>contenido</GuardaSesion>);
    expect(await screen.findByTestId('guarda-sesion-error')).toBeTruthy();
    expect(screen.queryByText('contenido')).toBeNull();
  });

  it('las rutas públicas no consultan la sesión', () => {
    ruta = '/ingresar';
    const espia = vi.spyOn(authApi, 'obtenerSesionActualApi');
    render(<GuardaSesion>formulario</GuardaSesion>);
    expect(screen.getByText('formulario')).toBeTruthy();
    expect(espia).not.toHaveBeenCalled();
  });
});
