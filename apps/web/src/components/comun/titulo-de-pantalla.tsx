import React from 'react';
import { entradaDe, type IdDeModulo } from '../../lib/navegacion';

export interface TituloDePantallaProps {
  /** Módulo de la tabla única de navegación (ADR-0032 §3): el texto del H1 es su etiqueta. */
  modulo: IdDeModulo;
  id?: string;
  /** Título que sustituye al de la tabla (p. ej. «Mis números» en lugar de «Reportes de la agencia»). */
  etiqueta?: string;
  className?: string;
}

/** H1 de una pantalla de primer nivel: la etiqueta es la misma del menú y de la paleta. */
export function TituloDePantalla({ modulo, id, etiqueta, className }: TituloDePantallaProps) {
  return (
    <h1 id={id} className={className}>
      {etiqueta ?? entradaDe(modulo).etiqueta}
    </h1>
  );
}
