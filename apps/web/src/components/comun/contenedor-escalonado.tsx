'use client';

import React from 'react';
import { useMovimientoReducido } from './animaciones-util';

export interface ContenedorEscalonadoProps {
  children: React.ReactNode;
  as?: 'div' | 'ul' | 'ol' | 'section';
  className?: string;
  'data-testid'?: string;
}

/**
 * Contenedor para listas y cuadrículas con animación de entrada escalonada suave (< 300ms).
 *
 * Respeta automáticamente `prefers-reduced-motion: reduce`.
 */
export function ContenedorEscalonado({
  children,
  as: Componente = 'div',
  className = '',
  'data-testid': testId = 'contenedor-escalonado',
}: ContenedorEscalonadoProps) {
  const reducido = useMovimientoReducido();

  const claseAnimacion = reducido ? '' : 'escalonado-hijos';

  return (
    <Componente data-testid={testId} className={`${claseAnimacion} ${className}`.trim()}>
      {children}
    </Componente>
  );
}
