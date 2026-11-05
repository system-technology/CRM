import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { PERMISOS, type SesionActual } from '@viajapro/contracts';
import {
  tienePermiso,
  puedeVerNetoYMargen,
  puedeVerTodasConversaciones,
  puedeOperarBandeja,
  puedeEscribirCrm,
  puedeEscribirCotizacion,
  explicacionFaltaPermiso,
  evaluarAccionMutacion,
  usePermisos,
  PERMISO_BANDEJA_OPERAR,
  PERMISO_CRM_ESCRIBIR,
  PERMISO_COTIZACION_ESCRIBIR,
  MAPA_ETIQUETAS_PERMISOS,
} from './permisos';
import * as authApi from './auth-api';
import * as modoDemoLib from './modo-demo';

const SESION_OPERACIONES: SesionActual = {
  identidad: {
    id: '01932000-0000-7000-8000-000000000099',
    correo: 'operaciones@viajapro.com',
    nombre: 'Usuario Operaciones',
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
    rol: 'OPERACIONES',
    permisos: ['conversaciones.ver_todas', 'catalogo.administrar'],
  },
};

const SESION_DUENO_COMPLETO: SesionActual = {
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
    permisos: [...PERMISOS],
  },
};

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
    permisos: ['conversaciones.ver_todas', 'bandeja.operar', 'crm.escribir', 'cotizacion.escribir'],
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

describe('Lógica y evaluación de permisos (T-118 / T-089 / 0c.27)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Usuario de solo lectura (OPERACIONES)', () => {
    it('deniega estrictamente las mutaciones de bandeja.operar, crm.escribir y cotizacion.escribir', () => {
      expect(tienePermiso(SESION_OPERACIONES, PERMISO_BANDEJA_OPERAR)).toBe(false);
      expect(tienePermiso(SESION_OPERACIONES, PERMISO_CRM_ESCRIBIR)).toBe(false);
      expect(tienePermiso(SESION_OPERACIONES, PERMISO_COTIZACION_ESCRIBIR)).toBe(false);

      expect(puedeOperarBandeja(SESION_OPERACIONES)).toBe(false);
      expect(puedeEscribirCrm(SESION_OPERACIONES)).toBe(false);
      expect(puedeEscribirCotizacion(SESION_OPERACIONES)).toBe(false);
    });

    it('deniega ver neto y margen para OPERACIONES', () => {
      expect(puedeVerNetoYMargen(SESION_OPERACIONES)).toBe(false);
    });

    it('permite ver todas las conversaciones y catálogo según su rol sembrado', () => {
      expect(puedeVerTodasConversaciones(SESION_OPERACIONES)).toBe(true);
      expect(tienePermiso(SESION_OPERACIONES, 'catalogo.administrar')).toBe(true);
    });

    it('evaluarAccionMutacion genera explicación y atributos para deshabilitar botón en OPERACIONES', () => {
      const resBandeja = evaluarAccionMutacion(SESION_OPERACIONES, PERMISO_BANDEJA_OPERAR);
      expect(resBandeja.permitido).toBe(false);
      expect(resBandeja.explicacion).toContain('Operar bandeja');
      expect(resBandeja.explicacion).toContain('bandeja.operar');
      expect(resBandeja.atributosBoton.disabled).toBe(true);
      expect(resBandeja.atributosBoton.title).toBe(resBandeja.explicacion);
      expect(resBandeja.atributosBoton['aria-disabled']).toBe(true);

      const resCrm = evaluarAccionMutacion(SESION_OPERACIONES, PERMISO_CRM_ESCRIBIR);
      expect(resCrm.permitido).toBe(false);
      expect(resCrm.explicacion).toContain('Modificar CRM');
      expect(resCrm.explicacion).toContain('crm.escribir');

      const resCot = evaluarAccionMutacion(SESION_OPERACIONES, PERMISO_COTIZACION_ESCRIBIR);
      expect(resCot.permitido).toBe(false);
      expect(resCot.explicacion).toContain('Crear cotizaciones');
      expect(resCot.explicacion).toContain('cotizacion.escribir');
    });
  });

  describe('Usuario con todos los permisos (DUEÑO)', () => {
    it('concede todos los permisos del catálogo a la dueña', () => {
      for (const permiso of PERMISOS) {
        expect(tienePermiso(SESION_DUENO_COMPLETO, permiso)).toBe(true);
      }

      expect(puedeOperarBandeja(SESION_DUENO_COMPLETO)).toBe(true);
      expect(puedeEscribirCrm(SESION_DUENO_COMPLETO)).toBe(true);
      expect(puedeEscribirCotizacion(SESION_DUENO_COMPLETO)).toBe(true);
      expect(puedeVerNetoYMargen(SESION_DUENO_COMPLETO)).toBe(true);
    });

    it('evaluarAccionMutacion permite la acción sin deshabilitar botones', () => {
      const res = evaluarAccionMutacion(SESION_DUENO_COMPLETO, PERMISO_BANDEJA_OPERAR);
      expect(res.permitido).toBe(true);
      expect(res.explicacion).toBeUndefined();
      expect(res.atributosBoton.disabled).toBeUndefined();
      expect(res.atributosBoton.title).toBeUndefined();
    });
  });

  describe('Usuario con rol ASESOR comercial', () => {
    it('permite mutaciones comerciales pero deniega margen y administración', () => {
      expect(puedeOperarBandeja(SESION_ASESOR)).toBe(true);
      expect(puedeEscribirCrm(SESION_ASESOR)).toBe(true);
      expect(puedeEscribirCotizacion(SESION_ASESOR)).toBe(true);

      expect(puedeVerNetoYMargen(SESION_ASESOR)).toBe(false);
      expect(tienePermiso(SESION_ASESOR, 'usuarios.administrar')).toBe(false);
      expect(tienePermiso(SESION_ASESOR, 'roles.administrar')).toBe(false);
    });
  });

  describe('Etiquetas y catálogo de permisos (MAPA_ETIQUETAS_PERMISOS)', () => {
    it('contiene etiquetas y descripciones para todos los permisos del contrato Zod', () => {
      for (const permiso of PERMISOS) {
        const info = MAPA_ETIQUETAS_PERMISOS[permiso];
        expect(info).toBeDefined();
        expect(info.clave).toBe(permiso);
        expect(info.nombre.length).toBeGreaterThan(3);
        expect(info.descripcion.length).toBeGreaterThan(10);
        expect(info.categoria).toMatch(/^(bandeja|crm|cotizacion|catalogo|administracion)$/);
      }
    });

    it('describe específicamente los 3 permisos de mutación introducidos en T-089', () => {
      expect(MAPA_ETIQUETAS_PERMISOS['bandeja.operar'].nombre).toBe('Operar bandeja');
      expect(MAPA_ETIQUETAS_PERMISOS['crm.escribir'].nombre).toBe('Modificar CRM');
      expect(MAPA_ETIQUETAS_PERMISOS['cotizacion.escribir'].nombre).toBe('Crear cotizaciones');
    });
  });

  describe('explicacionFaltaPermiso', () => {
    it('genera mensajes comprensibles en es-CO con el nombre del permiso', () => {
      const expBandeja = explicacionFaltaPermiso(PERMISO_BANDEJA_OPERAR);
      expect(expBandeja).toContain('bandeja.operar');
      expect(expBandeja).toContain('Operar bandeja');

      const expCrm = explicacionFaltaPermiso(PERMISO_CRM_ESCRIBIR);
      expect(expCrm).toContain('crm.escribir');
      expect(expCrm).toContain('Modificar CRM');

      const expCot = explicacionFaltaPermiso(PERMISO_COTIZACION_ESCRIBIR);
      expect(expCot).toContain('cotizacion.escribir');
      expect(expCot).toContain('Crear cotizaciones');
    });
  });

  describe('Manejo en modo demo (fallback documentado)', () => {
    it('trata permisos de mutación como concedidos en modo demo si el rol NO es OPERACIONES', () => {
      vi.spyOn(modoDemoLib, 'esModoDemo').mockReturnValue(true);

      const sesionDemoAsesorSinPermisos: SesionActual = {
        ...SESION_ASESOR,
        acceso: {
          usuarioId: 'usr-demo',
          rol: 'Asesor Comercial',
          permisos: [], // No tiene permisos explícitos aún
        },
      };

      expect(tienePermiso(sesionDemoAsesorSinPermisos, PERMISO_BANDEJA_OPERAR)).toBe(true);
      expect(tienePermiso(sesionDemoAsesorSinPermisos, PERMISO_CRM_ESCRIBIR)).toBe(true);
      expect(tienePermiso(sesionDemoAsesorSinPermisos, PERMISO_COTIZACION_ESCRIBIR)).toBe(true);
    });

    it('MANTIENE la denegación estricta para OPERACIONES incluso en modo demo', () => {
      vi.spyOn(modoDemoLib, 'esModoDemo').mockReturnValue(true);

      expect(tienePermiso(SESION_OPERACIONES, PERMISO_BANDEJA_OPERAR)).toBe(false);
      expect(tienePermiso(SESION_OPERACIONES, PERMISO_CRM_ESCRIBIR)).toBe(false);
      expect(tienePermiso(SESION_OPERACIONES, PERMISO_COTIZACION_ESCRIBIR)).toBe(false);
    });
  });

  describe('Hook usePermisos', () => {
    it('expone todas las funciones de verificación y evaluación para OPERACIONES', () => {
      const { result } = renderHook(() => usePermisos(SESION_OPERACIONES));

      expect(result.current.cargando).toBe(false);
      expect(result.current.puedeOperarBandeja).toBe(false);
      expect(result.current.puedeEscribirCrm).toBe(false);
      expect(result.current.puedeEscribirCotizacion).toBe(false);
      expect(result.current.puedeVerNetoYMargen).toBe(false);
      expect(result.current.puedeVerTodasConversaciones).toBe(true);

      const estado = result.current.evaluarAccion(PERMISO_BANDEJA_OPERAR);
      expect(estado.permitido).toBe(false);
      expect(estado.atributosBoton.disabled).toBe(true);
    });

    it('expone permisos completos cuando la sesión es de DUEÑO', () => {
      const { result } = renderHook(() => usePermisos(SESION_DUENO_COMPLETO));

      expect(result.current.cargando).toBe(false);
      expect(result.current.puedeOperarBandeja).toBe(true);
      expect(result.current.puedeEscribirCrm).toBe(true);
      expect(result.current.puedeEscribirCotizacion).toBe(true);
      expect(result.current.puedeVerNetoYMargen).toBe(true);
    });

    it('consulta la sesión al servidor si no se proporciona sesión inicial', async () => {
      vi.spyOn(authApi, 'obtenerSesionActualApi').mockResolvedValue(SESION_OPERACIONES);

      const { result } = renderHook(() => usePermisos());
      expect(result.current.cargando).toBe(true);

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });

      expect(result.current.sesion).toEqual(SESION_OPERACIONES);
      expect(result.current.puedeOperarBandeja).toBe(false);
    });

    it('maneja errores de red sin lanzar excepciones', async () => {
      vi.spyOn(authApi, 'obtenerSesionActualApi').mockRejectedValue(new Error('Fallo de red'));

      const { result } = renderHook(() => usePermisos());

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });

      expect(result.current.sesion).toBeNull();
      expect(result.current.puedeOperarBandeja).toBe(false);
    });
  });

  describe('Casos límite de sesión', () => {
    it('devuelve false cuando la sesión es null o undefined', () => {
      expect(tienePermiso(null, PERMISO_BANDEJA_OPERAR)).toBe(false);
      expect(tienePermiso(undefined, PERMISO_BANDEJA_OPERAR)).toBe(false);
      expect(puedeOperarBandeja(null)).toBe(false);
    });

    it('devuelve false cuando la sesión no tiene tenant activo', () => {
      expect(tienePermiso(SESION_SIN_ACCESO_ACTIVO, PERMISO_BANDEJA_OPERAR)).toBe(false);
      expect(puedeEscribirCrm(SESION_SIN_ACCESO_ACTIVO)).toBe(false);
    });
  });
});
