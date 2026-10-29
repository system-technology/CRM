import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AceptarInvitacionPage from './page';

describe('AceptarInvitacionPage (/aceptar-invitacion) — T-112', () => {
  const TOKEN_VALIDO = 'tok_invitacion_segura_32bytes_base64url_abcdef';
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/aceptar-invitacion');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.replaceState(null, '', '/aceptar-invitacion');
  });

  it('muestra el estado de token ausente cuando la URL no trae fragmento #token', async () => {
    window.history.replaceState(null, '', '/aceptar-invitacion');

    render(<AceptarInvitacionPage />);

    expect(await screen.findByTestId('estado-token-ausente')).toBeDefined();
    expect(screen.getByText(/Enlace de invitación incompleto/i)).toBeDefined();
  });

  it('muestra el estado de invitación inválida si el token en el fragmento es demasiado corto y limpia la URL', async () => {
    const spyReplace = vi.spyOn(window.history, 'replaceState');
    window.location.hash = '#token=corto123';

    render(<AceptarInvitacionPage />);

    expect(await screen.findByTestId('estado-invalido-o-vencido')).toBeDefined();
    expect(spyReplace).toHaveBeenCalledWith(null, '', '/aceptar-invitacion');
  });

  it('lee el token de location.hash, lo borra con replaceState y envía POST /api/v1/auth/invitaciones/aceptar hacia el estado de éxito', async () => {
    window.location.hash = `#token=${TOKEN_VALIDO}`;
    const spyReplace = vi.spyOn(window.history, 'replaceState');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    globalThis.fetch = fetchMock;

    render(<AceptarInvitacionPage />);

    const inputNombre = await screen.findByTestId('input-nombre-invitacion');
    expect(spyReplace).toHaveBeenCalledWith(null, '', '/aceptar-invitacion');

    fireEvent.change(inputNombre, { target: { value: 'Mateo Cárdenas' } });
    fireEvent.change(screen.getByTestId('input-contrasena-invitacion'), {
      target: { value: 'clave-super-segura-2026' },
    });

    fireEvent.click(screen.getByTestId('btn-aceptar-invitacion'));

    expect(await screen.findByTestId('estado-exito-invitacion')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/auth/invitaciones/aceptar');
    expect(JSON.parse(init.body as string)).toEqual({
      token: TOKEN_VALIDO,
      nombre: 'Mateo Cárdenas',
      contrasena: 'clave-super-segura-2026',
    });
  });

  it('muestra estado invalido_o_vencido cuando el servidor responde 400 INVITACION_INVALIDA', async () => {
    window.location.hash = `#token=${TOKEN_VALIDO}`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: { code: 'INVITACION_INVALIDA', message: 'La invitación no es válida o caducó.' },
        }),
    });

    render(<AceptarInvitacionPage />);

    fireEvent.change(await screen.findByTestId('input-nombre-invitacion'), {
      target: { value: 'Mateo Cárdenas' },
    });
    fireEvent.change(screen.getByTestId('input-contrasena-invitacion'), {
      target: { value: 'clave-super-segura-2026' },
    });
    fireEvent.click(screen.getByTestId('btn-aceptar-invitacion'));

    expect(await screen.findByTestId('estado-invalido-o-vencido')).toBeDefined();
  });

  it('muestra estado error_red cuando falla la conexión y permite reintentar conservando el token en memoria', async () => {
    window.location.hash = `#token=${TOKEN_VALIDO}`;

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      });
    globalThis.fetch = fetchMock;

    render(<AceptarInvitacionPage />);

    fireEvent.change(await screen.findByTestId('input-nombre-invitacion'), {
      target: { value: 'Mateo Cárdenas' },
    });
    fireEvent.change(screen.getByTestId('input-contrasena-invitacion'), {
      target: { value: 'clave-super-segura-2026' },
    });
    fireEvent.click(screen.getByTestId('btn-aceptar-invitacion'));

    expect(await screen.findByTestId('estado-error-red')).toBeDefined();

    fireEvent.click(screen.getByTestId('btn-reintentar-invitacion'));

    await waitFor(async () => {
      expect(await screen.findByTestId('estado-exito-invitacion')).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
