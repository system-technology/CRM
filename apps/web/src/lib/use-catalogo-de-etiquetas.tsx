'use client';

/**
 * El catálogo de etiquetas de la agencia en el cliente (T-326): una sola carga, compartida por la
 * lista (filtro) y el chat (selector) mediante `ProveedorDeEtiquetas` en el layout de la bandeja.
 *
 * Sin librería de estado de servidor (no hay TanStack Query en `apps/web`): la carga es un efecto
 * con descarte de respuestas viejas. Mientras se recarga se conservan las etiquetas ya conocidas
 * (el selector no parpadea a «vacío»); el esqueleto solo sale la primera vez.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Etiqueta } from '@viajapro/contracts';
import { etiquetasApi } from './etiquetas-api';

export type EstadoDelCatalogo = 'cargando' | 'listo' | 'error';

export interface CatalogoDeEtiquetas {
  estado: EstadoDelCatalogo;
  etiquetas: Etiqueta[];
  /** Hay una recarga en curso (con o sin datos previos). */
  recargando: boolean;
  /** La última carga falló (la pantalla dice «No se pudieron cargar las etiquetas» y ofrece reintentar). */
  error: boolean;
  recargar: () => Promise<void>;
  /** Cambia el catálogo local sin pedirlo (tras crear, renombrar o borrar en Configuración). */
  reemplazar: (etiquetas: Etiqueta[]) => void;
}

export function useCatalogoDeEtiquetas(
  opciones: { habilitado?: boolean } = {},
): CatalogoDeEtiquetas {
  const habilitado = opciones.habilitado ?? true;
  const [estado, setEstado] = useState<EstadoDelCatalogo>('cargando');
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState(false);
  const turno = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    const miTurno = ++turno.current;
    setRecargando(true);
    try {
      const lista = await etiquetasApi.listar();
      if (!montado.current || miTurno !== turno.current) return;
      setEtiquetas(lista);
      setError(false);
      setEstado('listo');
    } catch {
      if (!montado.current || miTurno !== turno.current) return;
      // Sin console.error: la regla es no escribir nada de las etiquetas en la consola (R10).
      setError(true);
      setEstado((previo) => (previo === 'listo' ? 'listo' : 'error'));
    } finally {
      if (montado.current && miTurno === turno.current) setRecargando(false);
    }
  }, []);

  useEffect(() => {
    if (habilitado) void recargar();
  }, [habilitado, recargar]);

  const reemplazar = useCallback((lista: Etiqueta[]) => {
    turno.current++;
    setEtiquetas(lista);
    setError(false);
    setEstado('listo');
    setRecargando(false);
  }, []);

  return { estado, etiquetas, recargando, error, recargar, reemplazar };
}

const ContextoDeEtiquetas = createContext<CatalogoDeEtiquetas | null>(null);

/** Carga el catálogo una vez para toda la bandeja (lista y chat comparten la misma lista). */
export function ProveedorDeEtiquetas({ children }: { children: React.ReactNode }) {
  const catalogo = useCatalogoDeEtiquetas();
  return <ContextoDeEtiquetas.Provider value={catalogo}>{children}</ContextoDeEtiquetas.Provider>;
}

/**
 * El catálogo compartido si hay proveedor; si no (una pantalla suelta, una prueba), uno propio.
 * El hook propio siempre se llama —las reglas de los hooks— pero no carga si ya hay proveedor.
 */
export function useEtiquetasDeLaAgencia(): CatalogoDeEtiquetas {
  const compartido = useContext(ContextoDeEtiquetas);
  const propio = useCatalogoDeEtiquetas({ habilitado: compartido === null });
  return compartido ?? propio;
}
