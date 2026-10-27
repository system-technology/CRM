'use client';

import { useState, useEffect } from 'react';

/**
 * Hook para detectar si el usuario ha solicitado movimiento reducido en su SO/navegador (WCAG 2.1 AA).
 * Seguro para Server-Side Rendering (SSR).
 */
export function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducido(mediaQuery.matches);

    const listener = (evento: MediaQueryListEvent) => {
      setReducido(evento.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return reducido;
}

/**
 * Calcula el retraso de animación en milisegundos para una entrada escalonada (< 300ms).
 */
export function calcularRetrasoEscalonado(indice: number, pasoMs = 30, maximoMs = 270): number {
  return Math.min(Math.max(0, indice) * pasoMs, maximoMs);
}

/**
 * Genera el estilo inline con retraso escalonado si no se prefiere movimiento reducido.
 */
export function obtenerEstiloEscalonado(
  indice: number,
  esMovimientoReducido = false,
): React.CSSProperties {
  if (esMovimientoReducido) {
    return {};
  }
  return {
    animationDelay: `${calcularRetrasoEscalonado(indice)}ms`,
  };
}
