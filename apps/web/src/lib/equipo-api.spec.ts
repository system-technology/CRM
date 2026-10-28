import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  interpretarErrorInvitacion,
  listarRolesAgenciaApi,
  listarMiembrosEquipoApi,
  invitarMiembroApi,
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
});
