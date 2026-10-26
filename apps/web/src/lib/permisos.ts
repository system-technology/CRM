'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Permiso, SesionActual } from '@viajapro/contracts';
import { obtenerSesionActualApi } from './auth-api';

/** Permiso estricto de visualización de netos y márgenes del cotizador y tarifario (ADR-0011). */
export const PERMISO_VER_NETO_Y_MARGEN: Permiso = 'cotizacion.ver_neto_y_margen';
export const PERMISO_VER_TODAS_CONVERSACIONES: Permiso = 'conversaciones.ver_todas';

/**
 * Función pura para evaluar si una sesión cuenta con un permiso específico.
 * Regla de negocio: La fuente de verdad del permiso es el servidor vía sesión (R10 / ADR-0011).
 * Si no hay sesión o no hay acceso activo en el tenant, devuelve false.
 */
export function tienePermiso(sesion: SesionActual | null | undefined, permiso: Permiso): boolean {
  if (!sesion || !sesion.acceso || !Array.isArray(sesion.acceso.permisos)) {
    return false;
  }
  return sesion.acceso.permisos.includes(permiso);
}

/**
 * Función pura que evalúa si la sesión cuenta con el permiso para ver importes netos y margen comercial.
 */
export function puedeVerNetoYMargen(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_VER_NETO_Y_MARGEN);
}

export function puedeVerTodasConversaciones(sesion: SesionActual | null | undefined): boolean {
  return tienePermiso(sesion, PERMISO_VER_TODAS_CONVERSACIONES);
}

export interface ResultadoPermisos {
  sesion: SesionActual | null;
  cargando: boolean;
  tienePermiso: (permiso: Permiso) => boolean;
  puedeVerNetoYMargen: boolean;
  puedeVerTodasConversaciones: boolean;
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

  return {
    sesion,
    cargando,
    tienePermiso: verificar,
    puedeVerNetoYMargen: puedeVerNetoYMargen(sesion),
    puedeVerTodasConversaciones: puedeVerTodasConversaciones(sesion),
  };
}
