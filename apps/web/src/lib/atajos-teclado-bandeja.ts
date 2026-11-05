/**
 * Lógica pura, constantes y utilidades de atajos de teclado para la bandeja de mensajes (T-127).
 *
 * Atajos estándar:
 * - `j`: Siguiente conversación en la lista.
 * - `k`: Conversación anterior en la lista.
 * - `r`: Enfocar compositor de redacción de mensaje.
 * - `c`: Abrir modal «Enviar cotización».
 * - `s`: Crear seguimiento comercial / oportunidad.
 * - `?`: Abrir modal de ayuda de atajos de teclado.
 * - `Escape`: Cerrar modales o paneles abiertos.
 *
 * Invariante: NO se activan si el foco está en campos de texto editables (input, textarea, select, contenteditable).
 * Persistencia: Se pueden habilitar/deshabilitar en preferencias del usuario (localStorage).
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ConversacionResumen } from '@viajapro/contracts';

export const CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA = 'viajapro_atajos_teclado_habilitados';
export const EVENTO_PREFERENCIA_ATAJOS_CAMBIADA = 'viajapro:atajos-preferencia-cambiada';

export interface DefinicionAtajo {
  tecla: string;
  etiquetaTecla: string;
  descripcion: string;
  categoria: 'navegacion' | 'accion' | 'ayuda';
}

export const CATALOGO_ATAJOS_BANDEJA: DefinicionAtajo[] = [
  {
    tecla: 'j',
    etiquetaTecla: 'J',
    descripcion: 'Siguiente conversación',
    categoria: 'navegacion',
  },
  {
    tecla: 'k',
    etiquetaTecla: 'K',
    descripcion: 'Conversación anterior',
    categoria: 'navegacion',
  },
  {
    tecla: 'r',
    etiquetaTecla: 'R',
    descripcion: 'Enfocar compositor de mensaje',
    categoria: 'accion',
  },
  {
    tecla: 'c',
    etiquetaTecla: 'C',
    descripcion: 'Abrir modal «Enviar cotización»',
    categoria: 'accion',
  },
  {
    tecla: 's',
    etiquetaTecla: 'S',
    descripcion: 'Crear seguimiento comercial',
    categoria: 'accion',
  },
  {
    tecla: '?',
    etiquetaTecla: '?',
    descripcion: 'Mostrar ayuda de atajos de teclado',
    categoria: 'ayuda',
  },
  {
    tecla: 'Escape',
    etiquetaTecla: 'Esc',
    descripcion: 'Cerrar modal o panel activo',
    categoria: 'ayuda',
  },
];

/**
 * Determina si el elemento interactivo actual está en modo de edición de texto.
 * Cuando el usuario está escribiendo un mensaje, buscando o rellenando un formulario,
 * los atajos de teclado de un solo carácter no deben dispararse.
 */
export function esElementoEditable(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
    return true;
  }

  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox') {
    return true;
  }

  return false;
}

/**
 * Consulta la preferencia persistida de atajos de teclado.
 * Por defecto está habilitada (`true`).
 */
export function sonAtajosHabilitados(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  try {
    const valor = window.localStorage.getItem(CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA);
    if (valor === null) {
      return true;
    }
    return valor === 'true';
  } catch {
    return true;
  }
}

/**
 * Guarda la preferencia de atajos de teclado y notifica a los suscriptores.
 */
export function fijarAtajosHabilitados(habilitados: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA, String(habilitados));
    window.dispatchEvent(
      new CustomEvent(EVENTO_PREFERENCIA_ATAJOS_CAMBIADA, {
        detail: { habilitados },
      }),
    );
  } catch {
    // Si localStorage no está disponible (modo incógnito estricto), continuar sin fallar
  }
}

/**
 * Valida si un evento de teclado debe ser procesado como atajo global de la bandeja.
 */
export function debeProcesarAtajo(
  e: KeyboardEvent | React.KeyboardEvent,
  atajosHabilitados: boolean,
): boolean {
  if (!atajosHabilitados) {
    return false;
  }

  // Modificadores no permitidos en atajos de una sola tecla (excepto Shift para '?')
  if (e.ctrlKey || e.metaKey || e.altKey) {
    return false;
  }

  // No activar si el foco está en un campo de texto
  if (esElementoEditable(e.target)) {
    return false;
  }

  return true;
}

/**
 * Calcula el ID de la siguiente o anterior conversación en la lista dada.
 */
export function calcularSiguienteConversacionId(
  conversaciones: { id: string }[],
  idActual: string | null | undefined,
  direccion: 'siguiente' | 'anterior',
): string | null {
  if (!conversaciones || conversaciones.length === 0) {
    return null;
  }

  if (!idActual) {
    return conversaciones[0]?.id ?? null;
  }

  const indiceActual = conversaciones.findIndex((c) => c.id === idActual);
  if (indiceActual === -1) {
    return conversaciones[0]?.id ?? null;
  }

  if (direccion === 'siguiente') {
    const siguienteIndice = Math.min(indiceActual + 1, conversaciones.length - 1);
    return conversaciones[siguienteIndice]?.id ?? null;
  } else {
    const anteriorIndice = Math.max(indiceActual - 1, 0);
    return conversaciones[anteriorIndice]?.id ?? null;
  }
}

/**
 * Hook para observar y alternar la preferencia de atajos en componentes React.
 */
export function usePreferenciaAtajosTeclado() {
  const [atajosHabilitados, setHabilitadosState] = useState<boolean>(() => sonAtajosHabilitados());

  useEffect(() => {
    const handleCambio = (ev: Event) => {
      const custom = ev as CustomEvent<{ habilitados: boolean }>;
      if (custom.detail && typeof custom.detail.habilitados === 'boolean') {
        setHabilitadosState(custom.detail.habilitados);
      } else {
        setHabilitadosState(sonAtajosHabilitados());
      }
    };

    window.addEventListener(EVENTO_PREFERENCIA_ATAJOS_CAMBIADA, handleCambio);
    return () => window.removeEventListener(EVENTO_PREFERENCIA_ATAJOS_CAMBIADA, handleCambio);
  }, []);

  const alternarAtajos = useCallback(() => {
    const nuevo = !sonAtajosHabilitados();
    fijarAtajosHabilitados(nuevo);
    setHabilitadosState(nuevo);
  }, []);

  const setAtajosHabilitados = useCallback((nuevo: boolean) => {
    fijarAtajosHabilitados(nuevo);
    setHabilitadosState(nuevo);
  }, []);

  return {
    atajosHabilitados,
    alternarAtajos,
    setAtajosHabilitados,
  };
}

/**
 * Contexto compartido para sincronizar la lista de conversaciones y el modal de ayuda entre layout y página.
 */
export interface ContextoBandejaAtajos {
  conversaciones: ConversacionResumen[];
  setConversaciones: React.Dispatch<React.SetStateAction<ConversacionResumen[]>>;
  modalAyudaAbierto: boolean;
  setModalAyudaAbierto: React.Dispatch<React.SetStateAction<boolean>>;
  irASiguiente: (idActual: string) => string | null;
  irAAnterior: (idActual: string) => string | null;
  atajosHabilitados: boolean;
  setAtajosHabilitados: (habilitados: boolean) => void;
}

export const BandejaAtajosContext = createContext<ContextoBandejaAtajos | null>(null);

export function useBandejaAtajos(): ContextoBandejaAtajos {
  const ctx = useContext(BandejaAtajosContext);
  if (!ctx) {
    // Retorno defensivo para tests unitarios aislados
    return {
      conversaciones: [],
      setConversaciones: () => {},
      modalAyudaAbierto: false,
      setModalAyudaAbierto: () => {},
      irASiguiente: () => null,
      irAAnterior: () => null,
      atajosHabilitados: true,
      setAtajosHabilitados: () => {},
    };
  }
  return ctx;
}
