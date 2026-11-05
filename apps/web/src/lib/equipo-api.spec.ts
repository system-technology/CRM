import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  interpretarErrorInvitacion,
  listarRolesAgenciaApi,
  listarMiembrosEquipoApi,
  invitarMiembroApi,
  darDeBajaMiembroApi,
  ErrorMiembrosApi,
  inicialesDeNombre,
  miembroDesdeApi,
} from './equipo-api';

describe('equipo-api (T-027)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('viajapro_modo_demo', 'true');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('interpretarErrorInvitacion', () => {
    it('traduce CODIGO_INVALIDO con mensaje claro y qué hacer', () => {
      const err = interpretarErrorInvitacion({ codigo: 'CODIGO_INVALIDO' });
      expect(err.codigo).toBe('CODIGO_INVALIDO');
      expect(err.mensaje).toContain('ya fue utilizado o ha caducado');
      expect(err.queHacer).toContain('Genera una nueva invitación');
    });

    it('traduce DEMASIADOS_INTENTOS con mensaje y qué hacer de límite de envíos', () => {
      const err = interpretarErrorInvitacion({ codigo: 'DEMASIADOS_INTENTOS' });
      expect(err.codigo).toBe('DEMASIADOS_INTENTOS');
      expect(err.mensaje).toContain('límite de envíos');
      expect(err.queHacer).toContain('Espera 10 minutos');
    });

    it('traduce PERMISO_DENEGADO con recomendación de solicitar rol', () => {
      const err = interpretarErrorInvitacion({ codigo: 'PERMISO_DENEGADO' });
      expect(err.codigo).toBe('PERMISO_DENEGADO');
      expect(err.mensaje).toContain('usuarios.administrar');
      expect(err.queHacer).toContain('Dueño de la agencia');
    });

    it('traduce errores genéricos o excepciones de red', () => {
      const err = interpretarErrorInvitacion(new Error('Fallo de conexión'));
      expect(err.codigo).toBe('ERROR_DESCONOCIDO');
      expect(err.mensaje).toContain('Fallo de conexión');
      expect(err.queHacer).toBeDefined();
    });
  });

  describe('listarRolesAgenciaApi', () => {
    it('retorna los roles base de la agencia (DUENO, ASESOR, OPERACIONES)', async () => {
      const roles = await listarRolesAgenciaApi();
      expect(roles.length).toBeGreaterThanOrEqual(3);
      expect(roles.some((r) => r.clave === 'DUENO')).toBe(true);
      expect(roles.some((r) => r.clave === 'ASESOR')).toBe(true);
    });
  });

  describe('invitarMiembroApi', () => {
    it('falla con DATOS_INVALIDOS si el correo no tiene formato válido', async () => {
      await expect(
        invitarMiembroApi({
          correo: 'correo-no-valido',
          rolId: '01932000-0000-7000-8000-000000000002',
        }),
      ).rejects.toThrow();
    });

    it('en modo demo registra el nuevo miembro y lo devuelve en el listado', async () => {
      const res = await invitarMiembroApi({
        correo: 'nuevo.asesor@cartagenatours.co',
        rolId: '01932000-0000-7000-8000-000000000002',
        nombre: 'Andrés Valderrama',
        telefono: '+573005556677',
      });

      expect(res.ok).toBe(true);

      const miembros = await listarMiembrosEquipoApi();
      const creado = miembros.find((m) => m.email === 'nuevo.asesor@cartagenatours.co');
      expect(creado).toBeDefined();
      expect(creado?.nombre).toBe('Andrés Valderrama');
      expect(creado?.estado).toBe('INVITADO');
    });

    it('llama al endpoint real cuando no está en modo demo y procesa 202 Accepted', async () => {
      localStorage.removeItem('viajapro_modo_demo');

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ ok: true }),
      });

      const res = await invitarMiembroApi({
        correo: 'asesor.real@cartagenatours.co',
        rolId: '01932000-0000-7000-8000-000000000002',
      });

      expect(res.ok).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identidad/invitaciones'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('modo real: GET /api/v1/identidad/miembros', () => {
    const ID = '01932000-0000-7000-8000-0000000000a1';
    const ROL = '01932000-0000-7000-8000-0000000000c1';
    const api = {
      id: ID,
      nombre: 'Laura Restrepo',
      correo: 'laura@agencia.co',
      rol: { id: ROL, clave: null, nombre: 'Coordinadora de grupos' },
      estado: 'ACTIVO',
      creadoEn: '2026-10-01T15:00:00.000Z',
      ultimoAccesoEn: null,
    };

    beforeEach(() => {
      localStorage.removeItem('viajapro_modo_demo');
      localStorage.setItem('viajapro_miembros_equipo_cache', JSON.stringify([{ id: 'cache' }]));
    });

    it('adapta el contrato: sin teléfono, iniciales del nombre, rol propio por nombre', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([api]),
      });
      const lista = await listarMiembrosEquipoApi();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/identidad/miembros'),
        expect.objectContaining({ method: 'GET' }),
      );
      expect(lista).toHaveLength(1);
      const m = lista[0];
      expect(m?.telefono).toBeUndefined();
      expect(m?.avatarIniciales).toBe('LR');
      expect(m?.rolClave).toBeNull();
      expect(m?.rolNombre).toBe('Coordinadora de grupos');
      expect(m?.fechaIngreso).toBe('2026-10-01T15:00:00.000Z');
      expect(m?.estado).toBe('ACTIVO');
    });

    it('una lista vacía es vacía: no cae a localStorage ni al mock', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) });
      expect(await listarMiembrosEquipoApi()).toEqual([]);
    });

    it('403 lanza ErrorMiembrosApi con estado 403 (sin permiso)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: 'PERMISO_DENEGADO', message: 'no' } }),
      });
      await expect(listarMiembrosEquipoApi()).rejects.toMatchObject({
        codigo: 'PERMISO_DENEGADO',
        estado: 403,
      });
    });

    it('error de red lanza ErrorMiembrosApi, sin cache ni mock', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('red'));
      await expect(listarMiembrosEquipoApi()).rejects.toBeInstanceOf(ErrorMiembrosApi);
    });

    it('una respuesta fuera de contrato se rechaza', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: 'x' }]),
      });
      await expect(listarMiembrosEquipoApi()).rejects.toMatchObject({
        codigo: 'RESPUESTA_INVALIDA',
      });
    });

    it('la baja usa POST /miembros/:id/baja con el mismo id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 204 });
      await darDeBajaMiembroApi(ID);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/identidad/miembros/${ID}/baja`),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('invitar en modo real no escribe en localStorage', async () => {
      localStorage.removeItem('viajapro_miembros_equipo_cache');
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ ok: true }),
      });
      await invitarMiembroApi({ correo: 'a@b.co', rolId: ROL });
      expect(localStorage.getItem('viajapro_miembros_equipo_cache')).toBeNull();
    });
  });

  describe('adaptadores', () => {
    it('iniciales: dos palabras, una palabra y fallback al correo', () => {
      expect(inicialesDeNombre('maría del mar')).toBe('MD');
      expect(inicialesDeNombre('Carlos')).toBe('C');
      expect(inicialesDeNombre('', 'ana.gomez@x.co')).toBe('AG');
    });

    it('miembroDesdeApi conserva INACTIVO y no inventa INVITADO', () => {
      const m = miembroDesdeApi({
        id: '01932000-0000-7000-8000-0000000000a2',
        nombre: 'Z',
        correo: 'z@x.co',
        rol: { id: '01932000-0000-7000-8000-0000000000c2', clave: 'ASESOR', nombre: 'Asesor' },
        estado: 'INACTIVO',
        creadoEn: '2026-01-01T00:00:00.000Z',
        ultimoAccesoEn: null,
      });
      expect(m.estado).toBe('INACTIVO');
    });
  });
});
