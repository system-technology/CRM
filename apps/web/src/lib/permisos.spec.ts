import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { SesionActual } from '@viajapro/contracts';
import {
  tienePermiso,
  puedeVerNetoYMargen,
  usePermisos,
  PERMISO_VER_NETO_Y_MARGEN,
} from './permisos';
import * as authApi from './auth-api';

const SESION_ASESOR: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000001',
    correo: 'asesor@viajapro.com',
    nombre: 'Asesor Comercial',
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
    rol: 'Asesor Comercial',
    permisos: ['conversaciones.ver_todas'],
  },
};

const SESION_DUENO: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000002',
    correo: 'dueno@viajapro.com',
    nombre: 'Dueña Agencia',
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
    usuarioId: '01932000-0000-7000-8000-000000000022',
    rol: 'Dueño',
    permisos: [
      'cotizacion.ver_neto_y_margen',
      'usuarios.administrar',
      'roles.administrar',
      'conversaciones.ver_todas',
    ],
  },
};

const SESION_SIN_ACCESO_ACTIVO: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000003',
    correo: 'multi@viajapro.com',
    nombre: 'Usuario Sin Tenant',
  },
  agencias: [
    {
      id: '01932000-0000-7000-8000-00000000000a',
      nombre: 'Viajes El Sol',
      slug: 'viajes-el-sol',
    },
  ],
  tenantActivoId: null,
  acceso: null,
};

describe('Lógica y evaluación de permisos (0c.27)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('tienePermiso (función pura)', () => {
    it('devuelve false cuando la sesión es null o undefined', () => {
      expect(tienePermiso(null, PERMISO_VER_NETO_Y_MARGEN)).toBe(false);
      expect(tienePermiso(undefined, PERMISO_VER_NETO_Y_MARGEN)).toBe(false);
    });

    it('devuelve false cuando la sesión no tiene agencia activa fijada (acceso === null)', () => {
      expect(tienePermiso(SESION_SIN_ACCESO_ACTIVO, PERMISO_VER_NETO_Y_MARGEN)).toBe(false);
    });

    it('devuelve false cuando el usuario no tiene el permiso solicitado', () => {
      expect(tienePermiso(SESION_ASESOR, PERMISO_VER_NETO_Y_MARGEN)).toBe(false);
      expect(tienePermiso(SESION_ASESOR, 'usuarios.administrar')).toBe(false);
    });

    it('devuelve true cuando el usuario tiene el permiso asignado en su rol activo', () => {
      expect(tienePermiso(SESION_DUENO, PERMISO_VER_NETO_Y_MARGEN)).toBe(true);
      expect(tienePermiso(SESION_DUENO, 'usuarios.administrar')).toBe(true);
      expect(tienePermiso(SESION_DUENO, 'conversaciones.ver_todas')).toBe(true);
    });
  });

  describe('puedeVerNetoYMargen (función pura)', () => {
    it('devuelve true si la sesión cuenta con cotizacion.ver_neto_y_margen', () => {
      expect(puedeVerNetoYMargen(SESION_DUENO)).toBe(true);
    });

    it('devuelve false para un asesor sin permiso de margen', () => {
      expect(puedeVerNetoYMargen(SESION_ASESOR)).toBe(false);
    });

    it('devuelve false para sesiones nulas o sin acceso activo', () => {
      expect(puedeVerNetoYMargen(null)).toBe(false);
      expect(puedeVerNetoYMargen(SESION_SIN_ACCESO_ACTIVO)).toBe(false);
    });
  });

  describe('usePermisos (hook cliente)', () => {
    it('utiliza la sesión inicial síncrona si es provista', () => {
      const { result } = renderHook(() => usePermisos(SESION_DUENO));

      expect(result.current.cargando).toBe(false);
      expect(result.current.puedeVerNetoYMargen).toBe(true);
      expect(result.current.tienePermiso('usuarios.administrar')).toBe(true);
    });

    it('consulta la sesión al servidor y expone permisos de dueño', async () => {
      vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_DUENO);

      const { result } = renderHook(() => usePermisos());

      expect(result.current.cargando).toBe(true);

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });

      expect(result.current.puedeVerNetoYMargen).toBe(true);
      expect(result.current.sesion).toEqual(SESION_DUENO);
    });

    it('consulta la sesión al servidor y deniega margen para un asesor', async () => {
      vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_ASESOR);

      const { result } = renderHook(() => usePermisos());

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });

      expect(result.current.puedeVerNetoYMargen).toBe(false);
      expect(result.current.tienePermiso(PERMISO_VER_NETO_Y_MARGEN)).toBe(false);
      expect(result.current.tienePermiso('conversaciones.ver_todas')).toBe(true);
    });

    it('maneja errores de sesión 401 o caída de red sin lanzar excepciones', async () => {
      vi.spyOn(authApi, 'obtenerSesionActualApi').mockRejectedValue(
        new Error('401 Sin sesión activa'),
      );

      const { result } = renderHook(() => usePermisos());

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });

      expect(result.current.sesion).toBeNull();
      expect(result.current.puedeVerNetoYMargen).toBe(false);
    });
  });
});
