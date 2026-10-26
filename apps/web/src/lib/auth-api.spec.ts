import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZodError } from 'zod';
import {
  iniciarSesionApi,
  cerrarSesionApi,
  obtenerSesionActualApi,
  cambiarAgenciaActivaApi,
  estaAuthHabilitada,
  usaAuthReal,
  mapearErrorAcceso,
  AuthApiError,
  MOCK_SESION_UNICA_AGENCIA,
} from './auth-api';

describe('auth-api (ADR-0011 / Tarea 0c.29)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env['NEXT_PUBLIC_USE_REAL_AUTH'];
    delete process.env['NEXT_PUBLIC_AUTH_MAQUETA'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Configuración e Interruptores', () => {
    it('estaAuthHabilitada devuelve true con NEXT_PUBLIC_USE_REAL_AUTH=true', () => {
      expect(estaAuthHabilitada('true')).toBe(true);
      expect(estaAuthHabilitada('1')).toBe(true);
      expect(estaAuthHabilitada('false')).toBe(false);
      expect(estaAuthHabilitada(undefined)).toBe(false);
    });

    it('usaAuthReal lee process.env.NEXT_PUBLIC_USE_REAL_AUTH', () => {
      process.env['NEXT_PUBLIC_USE_REAL_AUTH'] = 'true';
      expect(usaAuthReal()).toBe(true);

      process.env['NEXT_PUBLIC_USE_REAL_AUTH'] = 'false';
      expect(usaAuthReal()).toBe(false);
    });

    it('mapearErrorAcceso mapea códigos de error canónicos a mensajes legibles', () => {
      expect(mapearErrorAcceso('CREDENCIALES_INVALIDAS')).toContain(
        'Correo o contraseña incorrectos',
      );
      expect(mapearErrorAcceso('DEMASIADOS_INTENTOS')).toContain('Demasiados intentos');
      expect(mapearErrorAcceso('SIN_SESION')).toContain('No hay una sesión activa');
      expect(mapearErrorAcceso('SIN_AGENCIA_ACTIVA')).toContain('Debes seleccionar una agencia');
      expect(mapearErrorAcceso('ACCESO_REVOCADO')).toContain(
        'Tu acceso a esta agencia ha sido revocado',
      );
      expect(mapearErrorAcceso('AGENCIA_SUSPENDIDA')).toContain('suspendida o inactiva');
      expect(mapearErrorAcceso('SIN_MEMBRESIA')).toContain('No perteneces a la agencia');
      expect(mapearErrorAcceso('CODIGO_INVALIDO')).toContain('El código ingresado no es válido');
      expect(mapearErrorAcceso('ORIGEN_NO_CONFIABLE')).toContain('origen de navegación no seguro');
      expect(mapearErrorAcceso('CODIGO_DESCONOCIDO', 'Mensaje fallback')).toBe('Mensaje fallback');
    });
  });

  describe('Modo Simulado / Offline (usaAuthReal = false)', () => {
    beforeEach(() => {
      process.env['NEXT_PUBLIC_USE_REAL_AUTH'] = 'false';
    });

    it('iniciarSesionApi devuelve sesión mock de una agencia con credenciales estándar', async () => {
      const sesion = await iniciarSesionApi({
        correo: 'asesor@viajapro.com',
        contrasena: 'demo123',
      });
      expect(sesion.identidad.correo).toBe('asesor@viajapro.com');
      expect(sesion.agencias.length).toBe(1);
      expect(sesion.tenantActivoId).toBeDefined();
    });

    it('iniciarSesionApi devuelve sesión multi-agencia cuando el correo incluye multi@', async () => {
      const sesion = await iniciarSesionApi({
        correo: 'multi@viajapro.com',
        contrasena: 'demo123',
      });
      expect(sesion.agencias.length).toBe(2);
      expect(sesion.tenantActivoId).toBeNull();
    });

    it('iniciarSesionApi lanza AuthApiError con error@ o clave incorrecta', async () => {
      await expect(
        iniciarSesionApi({ correo: 'error@viajapro.com', contrasena: 'demo123' }),
      ).rejects.toThrow(AuthApiError);

      await expect(
        iniciarSesionApi({ correo: 'asesor@viajapro.com', contrasena: 'incorrecta' }),
      ).rejects.toThrow(AuthApiError);
    });

    it('obtenerSesionActualApi devuelve la sesión activa en memoria', async () => {
      const sesion = await obtenerSesionActualApi();
      expect(sesion.identidad).toBeDefined();
    });

    it('cambiarAgenciaActivaApi actualiza el tenant activo en modo mock', async () => {
      const agenciaValida =
        MOCK_SESION_UNICA_AGENCIA.agencias[0]?.id ?? '01932000-0000-7000-8000-00000000000a';
      const sesion = await cambiarAgenciaActivaApi(agenciaValida);
      expect(sesion.tenantActivoId).toBe(agenciaValida);
    });

    it('cambiarAgenciaActivaApi rechaza un id de agencia inexistente', async () => {
      await expect(cambiarAgenciaActivaApi('01932000-0000-7000-8000-999999999999')).rejects.toThrow(
        AuthApiError,
      );
    });

    it('cerrarSesionApi resuelve sin error en modo mock', async () => {
      await expect(cerrarSesionApi()).resolves.toBeUndefined();
    });
  });

  describe('Conexión a la API Real (usaAuthReal = true)', () => {
    beforeEach(() => {
      process.env['NEXT_PUBLIC_USE_REAL_AUTH'] = 'true';
    });

    it('iniciarSesionApi envía POST con credentials include y valida contrato Zod', async () => {
      const mockRespuesta = {
        identidad: {
          id: '01932000-0000-7000-8000-000000000001',
          correo: 'asesor@viajapro.com',
          nombre: 'Asesor Real',
        },
        agencias: [
          {
            id: '01932000-0000-7000-8000-00000000000a',
            nombre: 'Agencia Real',
            slug: 'agencia-real',
          },
        ],
        tenantActivoId: '01932000-0000-7000-8000-00000000000a',
        acceso: {
          usuarioId: '01932000-0000-7000-8000-000000000011',
          rol: 'ASESOR',
          permisos: ['conversaciones.ver_todas'],
        },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRespuesta),
      });
      global.fetch = fetchMock;

      const res = await iniciarSesionApi({
        correo: 'asesor@viajapro.com',
        contrasena: 'claveSegura123',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/sign-in/email'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
      expect(res.identidad.correo).toBe('asesor@viajapro.com');
      expect(res.tenantActivoId).toBe('01932000-0000-7000-8000-00000000000a');
    });

    it('iniciarSesionApi lanza ZodError y NUNCA cae a mock ante un 200 malformado (R3 / 0c.34)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ usuario: 'invalido', sinContrato: true }),
      });
      global.fetch = fetchMock;

      await expect(
        iniciarSesionApi({ correo: 'asesor@viajapro.com', contrasena: 'clave123' }),
      ).rejects.toThrow(ZodError);
    });

    it('iniciarSesionApi maneja error 401 como CREDENCIALES_INVALIDAS', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 'CREDENCIALES_INVALIDAS', message: 'Credenciales inválidas' },
          }),
      });
      global.fetch = fetchMock;

      await expect(
        iniciarSesionApi({ correo: 'asesor@viajapro.com', contrasena: 'erronea' }),
      ).rejects.toThrowError(/Correo o contraseña incorrectos/);
    });

    it('iniciarSesionApi maneja error 429 como DEMASIADOS_INTENTOS', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { code: 'DEMASIADOS_INTENTOS' } }),
      });
      global.fetch = fetchMock;

      await expect(
        iniciarSesionApi({ correo: 'asesor@viajapro.com', contrasena: 'erronea' }),
      ).rejects.toThrowError(/Demasiados intentos fallidos/);
    });

    it('obtenerSesionActualApi envía GET con credentials include', async () => {
      const mockSesion = {
        identidad: {
          id: '01932000-0000-7000-8000-000000000001',
          correo: 'asesor@viajapro.com',
          nombre: 'Asesor Real',
        },
        agencias: [
          {
            id: '01932000-0000-7000-8000-00000000000a',
            nombre: 'Agencia Real',
            slug: 'agencia-real',
          },
        ],
        tenantActivoId: '01932000-0000-7000-8000-00000000000a',
        acceso: null,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSesion),
      });
      global.fetch = fetchMock;

      const res = await obtenerSesionActualApi();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/session'),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      );
      expect(res.identidad.nombre).toBe('Asesor Real');
    });

    it('obtenerSesionActualApi lanza AuthApiError con status 401 (SIN_SESION)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 'SIN_SESION', message: 'No hay sesión' },
          }),
      });
      global.fetch = fetchMock;

      await expect(obtenerSesionActualApi()).rejects.toThrowError(/No hay una sesión activa/);
    });

    it('cambiarAgenciaActivaApi envía POST con tenantId validado', async () => {
      const mockSesion = {
        identidad: {
          id: '01932000-0000-7000-8000-000000000002',
          correo: 'multi@viajapro.com',
          nombre: 'Ana Multi',
        },
        agencias: [
          {
            id: '01932000-0000-7000-8000-00000000000a',
            nombre: 'Agencia A',
            slug: 'agencia-a',
          },
        ],
        tenantActivoId: '01932000-0000-7000-8000-00000000000a',
        acceso: {
          usuarioId: '01932000-0000-7000-8000-000000000099',
          rol: 'DUENO',
          permisos: ['cotizacion.ver_neto_y_margen', 'usuarios.administrar'],
        },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSesion),
      });
      global.fetch = fetchMock;

      const res = await cambiarAgenciaActivaApi('01932000-0000-7000-8000-00000000000a');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/tenant-activo'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
      expect(res.tenantActivoId).toBe('01932000-0000-7000-8000-00000000000a');
    });

    it('cambiarAgenciaActivaApi maneja error 403 como SIN_MEMBRESIA', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: { code: 'SIN_MEMBRESIA', message: 'No pertenece a la agencia' },
          }),
      });
      global.fetch = fetchMock;

      await expect(
        cambiarAgenciaActivaApi('01932000-0000-7000-8000-00000000000a'),
      ).rejects.toThrowError(/No perteneces a la agencia seleccionada/);
    });

    it('cerrarSesionApi envía POST /api/v1/auth/sign-out', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });
      global.fetch = fetchMock;

      await expect(cerrarSesionApi()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/sign-out'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
    });
  });
});
