/**
 * Lógica pura y hook para persistencia de filtros guardados en localStorage (T-103).
 *
 * Permite al asesor recordar sus filtros frecuentes en Bandeja, Contactos y Oportunidades
 * entre recargas de página y sesiones del navegador, con opción explícita de limpiar.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { FiltroBandeja } from '@viajapro/contracts';

export const CLAVE_FILTROS_BANDEJA = 'viajapro_filtros_bandeja';
export const CLAVE_FILTROS_CONTACTOS = 'viajapro_filtros_contactos';
export const CLAVE_FILTROS_PIPELINE = 'viajapro_filtros_pipeline';

export type FiltrosBandejaPersistidos = {
  filtro: FiltroBandeja;
  buscar: string;
};

export const FILTROS_BANDEJA_DEFECTO: FiltrosBandejaPersistidos = {
  filtro: 'TODAS',
  buscar: '',
};

export type FiltrosContactosPersistidos = {
  busqueda: string;
  etiquetaFiltro: string;
  consentimientoFiltro: string;
};

export const FILTROS_CONTACTOS_DEFECTO: FiltrosContactosPersistidos = {
  busqueda: '',
  etiquetaFiltro: 'todas',
  consentimientoFiltro: 'todos',
};

export type FiltrosPipelinePersistidos = {
  filtroTexto: string;
  filtroAsesor: string;
  vista: 'kanban' | 'tabla';
};

export const FILTROS_PIPELINE_DEFECTO: FiltrosPipelinePersistidos = {
  filtroTexto: '',
  filtroAsesor: 'todos',
  vista: 'kanban',
};

/**
 * Recupera de forma segura los filtros almacenados en localStorage.
 * Si ocurre un error de parseo o el entorno es SSR, retorna los valores por defecto.
 */
export function obtenerFiltrosAlmacenados<T extends object>(
  clave: string,
  valoresPorDefecto: T,
): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return valoresPorDefecto;
  }

  try {
    const raw = window.localStorage.getItem(clave);
    if (!raw) return valoresPorDefecto;
    const parseado = JSON.parse(raw) as unknown;
    if (typeof parseado !== 'object' || parseado === null) {
      return valoresPorDefecto;
    }
    return {
      ...valoresPorDefecto,
      ...(parseado as Partial<T>),
    };
  } catch {
    return valoresPorDefecto;
  }
}

/**
 * Guarda de forma segura los filtros en localStorage.
 */
export function guardarFiltrosEnAlmacenamiento<T extends object>(clave: string, filtros: T): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(clave, JSON.stringify(filtros));
  } catch {
    // Ignorar excepciones de cuota o modo incógnito restringido
  }
}

/**
 * Elimina la clave de filtros en localStorage.
 */
export function limpiarFiltrosEnAlmacenamiento(clave: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Ignorar errores de acceso
  }
}

/**
 * Comprueba si al menos un filtro difiere de su valor por defecto.
 */
export function hayFiltrosActivos<T extends object>(
  actuales: T,
  porDefecto: T,
  camposIgnorados: (keyof T)[] = [],
): boolean {
  const actualesRecord = actuales as Record<string, unknown>;
  const porDefectoRecord = porDefecto as Record<string, unknown>;

  for (const key of Object.keys(porDefecto)) {
    if (camposIgnorados.includes(key as keyof T)) continue;
    if (actualesRecord[key] !== porDefectoRecord[key]) {
      return true;
    }
  }
  return false;
}

export interface ResultadoFiltrosPersistidos<T extends object> {
  filtros: T;
  setFiltros: (nuevos: T | ((prev: T) => T)) => void;
  actualizarFiltro: <K extends keyof T>(campo: K, valor: T[K]) => void;
  limpiarFiltros: () => void;
  tieneFiltrosActivos: boolean;
}

/**
 * Hook para gestionar filtros persistidos en localStorage de manera reactiva.
 */
export function useFiltrosPersistidos<T extends object>(
  clave: string,
  porDefecto: T,
  camposIgnoradosParaActivo: (keyof T)[] = [],
): ResultadoFiltrosPersistidos<T> {
  const [filtros, setFiltrosState] = useState<T>(() =>
    obtenerFiltrosAlmacenados(clave, porDefecto),
  );

  // Sincronizar en cliente tras hidratación si localStorage contenía datos
  useEffect(() => {
    const almacenados = obtenerFiltrosAlmacenados(clave, porDefecto);
    if (hayFiltrosActivos(almacenados, porDefecto, camposIgnoradosParaActivo)) {
      setFiltrosState(almacenados);
    }
  }, [clave]);

  const setFiltros = useCallback(
    (nuevos: T | ((prev: T) => T)) => {
      setFiltrosState((prev) => {
        const valorFinal = typeof nuevos === 'function' ? nuevos(prev) : nuevos;
        guardarFiltrosEnAlmacenamiento(clave, valorFinal);
        return valorFinal;
      });
    },
    [clave],
  );

  const actualizarFiltro = useCallback(
    <K extends keyof T>(campo: K, valor: T[K]) => {
      setFiltros((prev) => ({
        ...prev,
        [campo]: valor,
      }));
    },
    [setFiltros],
  );

  const limpiarFiltros = useCallback(() => {
    limpiarFiltrosEnAlmacenamiento(clave);
    setFiltrosState(porDefecto);
  }, [clave, porDefecto]);

  const tieneFiltrosActivos = useMemo(
    () => hayFiltrosActivos(filtros, porDefecto, camposIgnoradosParaActivo),
    [filtros, porDefecto, camposIgnoradosParaActivo],
  );

  return {
    filtros,
    setFiltros,
    actualizarFiltro,
    limpiarFiltros,
    tieneFiltrosActivos,
  };
}
