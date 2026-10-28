import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorPage from './error';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/cotizador',
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('ErrorPage (T-109)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clasifica error de sesión expirada y ofrece botón para iniciar sesión conservando destino', () => {
    const errorSesion = new Error('Unauthorized');
    const mockReset = vi.fn();

    render(<ErrorPage error={errorSesion} reset={mockReset} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Tu sesión ha expirado',
    );
    expect(screen.getByText('AUTH_SESION_EXPIRADA')).toBeDefined();

    const btnIngreso = screen.getByTestId('btn-ir-ingreso');
    expect(btnIngreso).toBeDefined();

    fireEvent.click(btnIngreso);
    expect(mockPush).toHaveBeenCalledWith(
      '/ingresar?redirigir=%2Fcotizador&motivo=sesion_expirada',
    );
  });

  it('clasifica error de red y permite reintentar invocando reset()', () => {
    const errorRed = new TypeError('Failed to fetch');
    const mockReset = vi.fn();

    render(<ErrorPage error={errorRed} reset={mockReset} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Sin conexión a internet',
    );
    expect(screen.getByText('RED_SIN_CONEXION')).toBeDefined();

    const btnReintentar = screen.getByTestId('btn-reintentar');
    fireEvent.click(btnReintentar);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renderiza digest de soporte técnico sin exponer stack trace', () => {
    const errorConDigest = Object.assign(new Error('Fallo interno'), { digest: 'DIGEST-12345' });
    const mockReset = vi.fn();

    render(<ErrorPage error={errorConDigest} reset={mockReset} />);

    expect(screen.getByText(/Ref\. Incidencia: DIGEST-12345/i)).toBeDefined();
    // No debe contener la palabra Error: Fallo interno en el cuerpo visible
    expect(screen.queryByText(/at Object/i)).toBeNull();
  });
});
