import { describe, it, expect, vi } from 'vitest';
import {
  extraerTokenDeFragmento,
  esFormatoTokenInvitacionValido,
  consumirTokenDeUrl,
  aceptarInvitacionApi,
} from './invitacion-token';

describe('invitacion-token — Lectura segura del fragmento y aceptación (T-112)', () => {
  const TOKEN_VALIDO = 'tok_invitacion_segura_32bytes_base64url_123456';

  describe('extraerTokenDeFragmento', () => {
    it('extrae el token cuando viene en #token=...', () => {
      expect(extraerTokenDeFragmento(`#token=${TOKEN_VALIDO}`)).toBe(TOKEN_VALIDO);
    });

    it('decodifica caracteres codificados en URL dentro del fragmento', () => {
      const original = 'abc+def/ghi=1234567890_xyz';
      const hash = `#token=${encodeURIComponent(original)}`;
      expect(extraerTokenDeFragmento(hash)).toBe(original);
    });

    it('extrae el token cuando hay varios parámetros en el fragmento', () => {
      expect(extraerTokenDeFragmento(`#origen=correo&token=${TOKEN_VALIDO}&v=1`)).toBe(
        TOKEN_VALIDO,
      );
    });

    it('devuelve null si el fragmento está vacío, solo tiene # o no incluye token', () => {
      expect(extraerTokenDeFragmento('')).toBeNull();
      expect(extraerTokenDeFragmento('#')).toBeNull();
      expect(extraerTokenDeFragmento('#   ')).toBeNull();
      expect(extraerTokenDeFragmento('#otro=valor')).toBeNull();
      expect(extraerTokenDeFragmento('#token=')).toBeNull();
      expect(extraerTokenDeFragmento('#token=   ')).toBeNull();
      expect(extraerTokenDeFragmento(null)).toBeNull();
      expect(extraerTokenDeFragmento(undefined)).toBeNull();
    });
  });

  describe('esFormatoTokenInvitacionValido', () => {
    it('acepta tokens entre 20 y 200 caracteres y rechaza los cortos o vacíos', () => {
      expect(esFormatoTokenInvitacionValido(TOKEN_VALIDO)).toBe(true);
      expect(esFormatoTokenInvitacionValido('x'.repeat(20))).toBe(true);
      expect(esFormatoTokenInvitacionValido('x'.repeat(200))).toBe(true);
      expect(esFormatoTokenInvitacionValido('corto-123')).toBe(false);
      expect(esFormatoTokenInvitacionValido('x'.repeat(201))).toBe(false);
      expect(esFormatoTokenInvitacionValido('')).toBe(false);
      expect(esFormatoTokenInvitacionValido(null)).toBe(false);
    });
  });

  describe('consumirTokenDeUrl', () => {
    it('lee el token de location.hash y lo borra de la URL con history.replaceState', () => {
      const replaceState = vi.fn();
      const ubicacion = {
        hash: `#token=${TOKEN_VALIDO}`,
        pathname: '/aceptar-invitacion',
        search: '',
      };

      const extraido = consumirTokenDeUrl(ubicacion, { replaceState });

      expect(extraido).toBe(TOKEN_VALIDO);
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(replaceState).toHaveBeenCalledWith(null, '', '/aceptar-invitacion');
      // Garantiza que la URL pasada a replaceState jamás contiene el token
      expect(JSON.stringify(replaceState.mock.calls)).not.toContain(TOKEN_VALIDO);
    });

    it('conserva query params inocuos al limpiar el fragmento pero elimina el hash', () => {
      const replaceState = vi.fn();
      const ubicacion = {
        hash: `#token=${TOKEN_VALIDO}`,
        pathname: '/aceptar-invitacion',
        search: '?lang=es',
      };

      const extraido = consumirTokenDeUrl(ubicacion, { replaceState });

      expect(extraido).toBe(TOKEN_VALIDO);
      expect(replaceState).toHaveBeenCalledWith(null, '', '/aceptar-invitacion?lang=es');
    });

    it('devuelve null y no invoca replaceState cuando no hay fragmento en la URL', () => {
      const replaceState = vi.fn();
      const ubicacion = {
        hash: '',
        pathname: '/aceptar-invitacion',
        search: '',
      };

      const extraido = consumirTokenDeUrl(ubicacion, { replaceState });

      expect(extraido).toBeNull();
      expect(replaceState).not.toHaveBeenCalled();
    });
  });

  describe('aceptarInvitacionApi', () => {
    it('envía el token en el cuerpo de POST /api/v1/auth/invitaciones/aceptar con no-referrer y devuelve exito', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      });

      const res = await aceptarInvitacionApi(
        {
          token: TOKEN_VALIDO,
          nombre: 'Camila Restrepo',
          contrasena: 'una-clave-segura-de-12-mas',
        },
        fetchMock,
      );

      expect(res).toEqual({ estado: 'exito' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [urlLlamada, opciones] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(urlLlamada).toContain('/api/v1/auth/invitaciones/aceptar');
      expect(urlLlamada).not.toContain(TOKEN_VALIDO);
      expect(opciones.method).toBe('POST');
      expect(opciones.referrerPolicy).toBe('no-referrer');
      expect(JSON.parse(opciones.body as string)).toEqual({
        token: TOKEN_VALIDO,
        nombre: 'Camila Restrepo',
        contrasena: 'una-clave-segura-de-12-mas',
      });
    });

    it('clasifica respuesta 400 INVITACION_INVALIDA como invalido_o_vencido sin filtrar el token', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              code: 'INVITACION_INVALIDA',
              message: 'La invitación no es válida o caducó.',
            },
          }),
      });

      const res = await aceptarInvitacionApi(
        {
          token: TOKEN_VALIDO,
          nombre: 'Camila Restrepo',
          contrasena: 'una-clave-segura-de-12-mas',
        },
        fetchMock,
      );

      expect(res.estado).toBe('invalido_o_vencido');
      if (res.estado === 'invalido_o_vencido') {
        expect(res.codigo).toBe('INVITACION_INVALIDA');
        expect(res.mensaje).not.toContain(TOKEN_VALIDO);
      }
    });

    it('clasifica fallo de fetch o error 500 como error_red sin exponer el token', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'));

      const res = await aceptarInvitacionApi(
        {
          token: TOKEN_VALIDO,
          nombre: 'Camila Restrepo',
          contrasena: 'una-clave-segura-de-12-mas',
        },
        fetchMock,
      );

      expect(res.estado).toBe('error_red');
      expect(JSON.stringify(res)).not.toContain(TOKEN_VALIDO);
    });

    it('rechaza tokens con formato inválido antes de llamar a la red', async () => {
      const fetchMock = vi.fn();

      const res = await aceptarInvitacionApi(
        {
          token: 'corto',
          nombre: 'Camila Restrepo',
          contrasena: 'una-clave-segura-de-12-mas',
        },
        fetchMock,
      );

      expect(res.estado).toBe('invalido_o_vencido');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
