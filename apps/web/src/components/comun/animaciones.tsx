'use client';

import React, { useEffect, useState } from 'react';

/**
 * Utilidades de animación y microinteracciones fluidas para ViajaPro (T-035).
 *
 * Proporciona:
 * - `obtenerClaseEscalonada`: Retrasos escalonados para listas y cuadrículas (40ms a 240ms).
 * - `usePrefersReducedMotion`: Detección reactiva de preferencia de movimiento reducido (WCAG 2.2).
 * - `ShimmerBox`: Caja de carga con brillo oceánico y arena dorada.
 * - `ContenedorEscalonado`: Envoltorio para animar listas infantiles de forma escalonada.
 */

/**
 * Devuelve las clases CSS para entrada escalonada según la posición en la lista (0-indexed).
 * Máximo 6 niveles de retraso (de 40ms a 240ms) para garantizar que todo cargue en menos de 300ms.
 */
export function obtenerClaseEscalonada(indice: number): string {
  if (indice < 0) return 'anim-entrada';
  const nivel = Math.min(Math.max(indice + 1, 1), 6);
  return `anim-entrada anim-retraso-${nivel}`;
}

/**
 * Hook para detectar si el sistema o usuario solicitó movimiento reducido.
 * Seguro contra SSR (devuelve false en servidor o antes de hidratación).
 */
export function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else if (typeof mediaQuery.addListener === 'function') {
      // Compatibilidad con navegadores antiguos
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  return reducedMotion;
}

export interface ShimmerBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  ancho?: string;
  alto?: string;
  redondeado?: string;
}

/**
 * Caja de esqueleto reutilizable con efecto de brillo (shimmer) oceánico-dorado (T-035).
 */
export function ShimmerBox({
  ancho = 'w-full',
  alto = 'h-4',
  redondeado = 'rounded-md',
  className = '',
  ...resto
}: ShimmerBoxProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="shimmer-box"
      className={`esqueleto-brillo ${ancho} ${alto} ${redondeado} ${className}`}
      {...resto}
    />
  );
}

export interface ContenedorEscalonadoProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: React.ElementType;
}

/**
 * Envoltorio que aplica animación escalonada automática a cada hijo directo.
 */
export function ContenedorEscalonado({
  children,
  as: Component = 'div',
  className = '',
  ...resto
}: ContenedorEscalonadoProps) {
  const reducedMotion = usePrefersReducedMotion();

  const hijosAnimados = React.Children.map(children, (child, idx) => {
    if (!React.isValidElement(child)) return child;

    // Si el usuario prefiere movimiento reducido, no aplicar clases de desplazamiento
    if (reducedMotion) return child;

    const claseEscalonada = obtenerClaseEscalonada(idx);
    const claseExistente = (child.props as { className?: string }).className || '';

    return React.cloneElement(child, {
      className: `${claseExistente} ${claseEscalonada}`.trim(),
    } as React.HTMLAttributes<HTMLElement>);
  });

  return (
    <Component className={className} {...resto}>
      {hijosAnimados}
    </Component>
  );
}
