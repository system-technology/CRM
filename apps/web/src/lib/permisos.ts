'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Permiso, SesionActual } from '@viajapro/contracts';
import { obtenerSesionActualApi } from './auth-api';
import { esModoDemo } from './modo-demo';

// =============================================================================
// Constantes de permisos de @viajapro/contracts (ADR-0011, T-089, T-118)
// =============================================================================

export const PERMISO_VER_NETO_Y_MARGEN: Permiso = 'cotizacion.ver_neto_y_margen';
export const PERMISO_VER_TODAS_CONVERSACIONES: Permiso = 'conversaciones.ver_todas';
export const PERMISO_USUARIOS_ADMINISTRAR: Permiso = 'usuarios.administrar';
export const PERMISO_ROLES_ADMINISTRAR: Permiso = 'roles.administrar';
export const PERMISO_CATALOGO_ADMINISTRAR: Permiso = 'catalogo.administrar';

/** Permisos introducidos en T-089 para mutaciones granulares */
export const PERMISO_BANDEJA_OPERAR: Permiso = 'bandeja.operar';
export const PERMISO_CRM_ESCRIBIR: Permiso = 'crm.escribir';
export const PERMISO_COTIZACION_ESCRIBIR: Permiso = 'cotizacion.escribir';

/** Permisos de mutación introducidos en T-089 */
export const PERMISOS_MUTACION_T089: readonly Permiso[] = [
  PERMISO_BANDEJA_OPERAR,
  PERMISO_CRM_ESCRIBIR,
  PERMISO_COTIZACION_ESCRIBIR,
] as const;

// =============================================================================
// Mapa de etiquetas y descripciones en lenguaje humano (es-CO)
// =============================================================================

export interface EtiquetaPermiso {
  clave: Permiso;
  nombre: string;
  descripcion: string;
  categoria: 'bandeja' | 'crm' | 'cotizacion' | 'catalogo' | 'administracion';
}

export const MAPA_ETIQUETAS_PERMISOS: Record<Permiso, EtiquetaPermiso> = {
  'bandeja.operar': {
    clave: 'bandeja.operar',
    nombre: 'Operar bandeja',
    descripcion:
      'Permite responder mensajes, reasignar conversaciones y gestionar notas internas en la bandeja de WhatsApp.',
    categoria: 'bandeja',
  },
  'crm.escribir': {
    clave: 'crm.escribir',
    nombre: 'Modificar CRM',
    descripcion:
      'Permite crear o editar fichas de contactos, gestionar oportunidades y registrar seguimientos comerciales.',
    categoria: 'crm',
  },
  'cotizacion.escribir': {
    clave: 'cotizacion.escribir',
    nombre: 'Crear cotizaciones',
    descripcion:
      'Permite formular nuevas cotizaciones de viaje, calcular propuestas y crear versiones de tarifas.',
    categoria: 'cotizacion',
  },
  'cotizacion.ver_neto_y_margen': {
    clave: 'cotizacion.ver_neto_y_margen',
    nombre: 'Ver neto y margen',
    descripcion:
      'Permite visualizar la tarifa neta del mayorista y el margen comercial de la agencia en el cotizador.',
    categoria: 'cotizacion',
  },
  'conversaciones.ver_todas': {
    clave: 'conversaciones.ver_todas',
    nombre: 'Ver todas las conversaciones',
    descripcion:
      'Permite consultar las conversaciones de toda la agencia en la bandeja, no solo las asignadas a uno mismo.',
    categoria: 'bandeja',
  },
  'catalogo.administrar': {
    clave: 'catalogo.administrar',
    nombre: 'Administrar catálogo',
    descripcion:
      'Permite crear, editar, desactivar e importar paquetes y salidas turísticas del catálogo.',
    categoria: 'catalogo',
  },
  'usuarios.administrar': {
    clave: 'usuarios.administrar',
    nombre: 'Administrar equipo',
    descripcion:
      'Permite invitar nuevos usuarios, cambiar sus roles y desactivar accesos en la agencia.',
    categoria: 'administracion',
  },
  'roles.administrar': {
    clave: 'roles.administrar',
    nombre: 'Administrar roles',
    descripcion:
      'Permite crear, editar y definir los permisos asignados a los roles de la agencia.',
    categoria: 'administracion',
  },
};

// =============================================================================
// Explicaciones amigables al deshabilitar botones de mutación
// =============================================================================

/**
 * Devuelve la explicación clara en es-CO de por qué una acción está deshabilitada,
 * indicando el permiso requerido para que el asesor pueda solicitarlo al administrador.
 */
export function explicacionFaltaPermiso(permiso: Permiso): string {
  switch (permiso) {
    case 'bandeja.operar':
      return 'Acción deshabilitada: se requiere el permiso «Operar bandeja» (bandeja.operar) para responder o gestionar conversaciones.';
    case 'crm.escribir':
      return 'Acción deshabilitada: se requiere el permiso «Modificar CRM» (crm.escribir) para crear o editar contactos, oportunidades o seguimientos.';
    case 'cotizacion.escribir':
      return 'Acción deshabilitada: se requiere el permiso «Crear cotizaciones» (cotizacion.escribir) para formular o modificar propuestas de viaje.';
    case 'cotizacion.ver_neto_y_margen':
      return 'Acceso restringido: se requiere el permiso «Ver neto y margen» (cotizacion.ver_neto_y_margen).';
    case 'catalogo.administrar':
      return 'Acción deshabilitada: se requiere el permiso «Administrar catálogo» (catalogo.administrar).';
    case 'usuarios.administrar':
      return 'Acceso restringido: se requiere el permiso «Administrar equipo» (usuarios.administrar).';
    case 'roles.administrar':
      return 'Acceso restringido: se requiere el permiso «Administrar roles» (roles.administrar).';
    case 'conversaciones.ver_todas':
      return 'Acceso restringido: se requiere el permiso «Ver todas las conversaciones» (conversaciones.ver_todas).';
    default:
      return 'Acción deshabilitada por falta de permisos en tu rol actual.';
  }
}

export interface EstadoAccionMutacion {
  /** Indica si el usuario cuenta con el permiso para realizar la mutación */
  permitido: boolean;
  /** Explicación lista para mostrar en title, tooltip o aria-description */
  explicacion?: string | undefined;
  /** Atributos HTML listos para aplicar a botones de la interfaz */
  atributosBoton: {
    disabled?: boolean | undefined;
    title?: string | undefined;
    'aria-disabled'?: boolean | undefined;
  };
}

/**
 * Evalúa el estado de una acción de mutación para botones de interfaz de usuario.
 * Proporciona el flag booleano `permitido`, la explicación humana y atributos listos para `<button>`.
 *
 * NOTA IMPORTANTE DE ARQUITECTURA (R1 / R2 / ADR-0011):
 * La interfaz de usuario deshabilita botones exclusivamente para mejorar la experiencia de uso.
 * La aplicación NUNCA confía únicamente en la interfaz: la API de NestJS y las políticas RLS
 * validan de forma estricta los permisos en cada mutación del servidor.
 */
export function evaluarAccionMutacion(
  sesion: SesionActual | null | undefined,
  permiso: Permiso,
): EstadoAccionMutacion {
  const permitido = tienePermiso(sesion, permiso);
  if (permitido) {
    return {
      permitido: true,
      atributosBoton: {},
    };
  }

  const explicacion = explicacionFaltaPermiso(permiso);
  return {
    permitido: false,
    explicacion,
    atributosBoton: {
      disabled: true,
      title: explicacion,
      'aria-disabled': true,
    },
  };
}

// =============================================================================
// Funciones puras de evaluación de permisos
// =============================================================================

/**
 * Función pura para evaluar si una sesión cuenta con un permiso específico.
 *
 * Reglas de negocio y aislamiento:
 * 1. La fuente de verdad del permiso es el servidor vía sesión (R10 / ADR-0011).
 * 2. Si no hay sesión o no hay acceso activo en el tenant, devuelve false.
 * 3. Usuario de solo lectura (rol `OPERACIONES`): por especificación de dominio y migración
 *    20261104130000, `OPERACIONES` es estrictamente de solo lectura y nunca recibe los permisos
 *    de mutación `bandeja.operar`, `crm.escribir` ni `cotizacion.escribir`.
 * 4. Transición / Modo Demo: Si la aplicación está en modo demo (`esModoDemo()` o entorno mock de pruebas)
 *    y la sesión no especifica permisos pero el rol no es el rol de solo lectura `OPERACIONES`,
 *    los permisos de mutación se tratan como concedidos para permitir explorar el sistema sin bloqueos.
 */
export function tienePermiso(sesion: SesionActual | null | undefined, permiso: Permiso): boolean {
  // Si no hay sesión o no hay acceso activo al tenant:
  if (!sesion || !sesion.acceso || !Array.isArray(sesion.acceso.permisos)) {
    // Si la aplicación está en modo demostración explícito (esModoDemo()),
    // concedemos permisos de mutación si no hay sesión para explorar el CRM.
    if (esModoDemo() && PERMISOS_MUTACION_T089.includes(permiso)) {
      return true;
    }
    return false;
  }

  // 1. Rol OPERACIONES es estrictamente de solo lectura (T-089 / T-118)
  const rol = sesion.acceso.rol?.toUpperCase();
  const esOperaciones = rol === 'OPERACIONES' || rol === 'OPERACIONES (SOLO LECTURA)';
  if (esOperaciones && PERMISOS_MUTACION_T089.includes(permiso)) {
    return false;
  }

  // 2. Verificación directa contra el contrato de sesión
  if (sesion.acceso.permisos.includes(permiso)) {
    return true;
  }

  // 3. Fallback en modo demo para exploración comercial (si el backend no estuviera conectado)
  if (esModoDemo() && PERMISOS_MUTACION_T089.includes(permiso) && !esOperaciones) {
    return true;
  }

  return false;
}

/** Funciones de conveniencia para permisos frecuentes */
export function puedeVerNetoYMargen(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_VER_NETO_Y_MARGEN);
}

export function puedeVerTodasConversaciones(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_VER_TODAS_CONVERSACIONES);
}

export function puedeOperarBandeja(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_BANDEJA_OPERAR);
}

export function puedeEscribirCrm(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_CRM_ESCRIBIR);
}

export function puedeEscribirCotizacion(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_COTIZACION_ESCRIBIR);
}

export function puedeAdministrarCatalogo(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_CATALOGO_ADMINISTRAR);
}

export function puedeAdministrarUsuarios(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_USUARIOS_ADMINISTRAR);
}

export function puedeAdministrarRoles(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_ROLES_ADMINISTRAR);
}

// =============================================================================
// Hook usePermisos para componentes cliente
// =============================================================================

export interface ResultadoPermisos {
  sesion: SesionActual | null;
  cargando: boolean;
  tienePermiso: (permiso: Permiso) => boolean;
  puedeVerNetoYMargen: boolean;
  puedeVerTodasConversaciones: boolean;
  puedeOperarBandeja: boolean;
  puedeEscribirCrm: boolean;
  puedeEscribirCotizacion: boolean;
  puedeAdministrarCatalogo: boolean;
  puedeAdministrarUsuarios: boolean;
  puedeAdministrarRoles: boolean;
  evaluarAccion: (permiso: Permiso) => EstadoAccionMutacion;
}

/**
 * Hook de React para acceder a los permisos de la sesión actual en componentes cliente.
 * Si se pasa una sesión inicial (útil en SSR o tests), se utiliza directamente.
 */
export function usePermisos(sesionInicial?: SesionActual | null): ResultadoPermisos {
  const [sesion, setSesion] = useState<SesionActual | null>(sesionInicial ?? null);
  const [cargando, setCargando] = useState<boolean>(sesionInicial === undefined);

  useEffect(() => {
    if (sesionInicial !== undefined) {
      setSesion(sesionInicial);
      setCargando(false);
      return;
    }

    let montado = true;
    obtenerSesionActualApi()
      .then((s) => {
        if (montado) {
          setSesion(s);
          setCargando(false);
        }
      })
      .catch(() => {
        if (montado) {
          setSesion(null);
          setCargando(false);
        }
      });

    return () => {
      montado = false;
    };
  }, [sesionInicial]);

  const verificar = useCallback((permiso: Permiso) => tienePermiso(sesion, permiso), [sesion]);
  const evaluar = useCallback(
    (permiso: Permiso) => evaluarAccionMutacion(sesion, permiso),
    [sesion],
  );

  return {
    sesion,
    cargando,
    tienePermiso: verificar,
    puedeVerNetoYMargen: puedeVerNetoYMargen(sesion),
    puedeVerTodasConversaciones: puedeVerTodasConversaciones(sesion),
    puedeOperarBandeja: puedeOperarBandeja(sesion),
    puedeEscribirCrm: puedeEscribirCrm(sesion),
    puedeEscribirCotizacion: puedeEscribirCotizacion(sesion),
    puedeAdministrarCatalogo: puedeAdministrarCatalogo(sesion),
    puedeAdministrarUsuarios: puedeAdministrarUsuarios(sesion),
    puedeAdministrarRoles: puedeAdministrarRoles(sesion),
    evaluarAccion: evaluar,
  };
}
