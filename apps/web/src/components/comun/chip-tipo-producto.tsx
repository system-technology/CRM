'use client';

import React from 'react';
import { Palmtree, Trees, Landmark, Ship, Hotel, Compass } from 'lucide-react';

export type TipoProductoTurismo =
  | 'isla_beach_club'
  | 'reserva_natural'
  | 'city_tour'
  | 'aventura_nautica'
  | 'paquete_hotel'
  | 'excursion_general';

export interface ConfiguracionTipoTurismo {
  id: TipoProductoTurismo;
  etiqueta: string;
  icono: React.ComponentType<{ className?: string }>;
  colorTexto: string;
  colorFondo: string;
  colorBorde: string;
  degradadoSustituto: string;
}

export const CONFIGURACIONES_TIPO_TURISMO: Record<TipoProductoTurismo, ConfiguracionTipoTurismo> = {
  isla_beach_club: {
    id: 'isla_beach_club',
    etiqueta: 'Isla & Beach Club',
    icono: Palmtree,
    colorTexto: 'text-cyan-900 dark:text-cyan-200',
    colorFondo: 'bg-cyan-50 dark:bg-cyan-950/50',
    colorBorde: 'border-cyan-300 dark:border-cyan-800',
    degradadoSustituto: 'from-cyan-500 via-teal-600 to-[#0B1F3A]',
  },
  reserva_natural: {
    id: 'reserva_natural',
    etiqueta: 'Reserva Natural & Ecoturismo',
    icono: Trees,
    colorTexto: 'text-emerald-900 dark:text-emerald-200',
    colorFondo: 'bg-emerald-50 dark:bg-emerald-950/50',
    colorBorde: 'border-emerald-300 dark:border-emerald-800',
    degradadoSustituto: 'from-emerald-600 via-teal-700 to-[#064E3B]',
  },
  city_tour: {
    id: 'city_tour',
    etiqueta: 'City Tour & Cultura',
    icono: Landmark,
    colorTexto: 'text-amber-900 dark:text-amber-200',
    colorFondo: 'bg-amber-50 dark:bg-amber-950/50',
    colorBorde: 'border-amber-300 dark:border-amber-800',
    degradadoSustituto: 'from-amber-500 via-orange-600 to-[#78350F]',
  },
  aventura_nautica: {
    id: 'aventura_nautica',
    etiqueta: 'Aventura & Náutica',
    icono: Ship,
    colorTexto: 'text-blue-900 dark:text-blue-200',
    colorFondo: 'bg-blue-50 dark:bg-blue-950/50',
    colorBorde: 'border-blue-300 dark:border-blue-800',
    degradadoSustituto: 'from-blue-500 via-indigo-600 to-[#0B1F3A]',
  },
  paquete_hotel: {
    id: 'paquete_hotel',
    etiqueta: 'Paquete con Hotel',
    icono: Hotel,
    colorTexto: 'text-indigo-900 dark:text-indigo-200',
    colorFondo: 'bg-indigo-50 dark:bg-indigo-950/50',
    colorBorde: 'border-indigo-300 dark:border-indigo-800',
    degradadoSustituto: 'from-indigo-600 via-purple-700 to-[#0B1F3A]',
  },
  excursion_general: {
    id: 'excursion_general',
    etiqueta: 'Excursión de Turismo',
    icono: Compass,
    colorTexto: 'text-teal-900 dark:text-teal-200',
    colorFondo: 'bg-teal-50 dark:bg-teal-950/50',
    colorBorde: 'border-teal-300 dark:border-teal-800',
    degradadoSustituto: 'from-cyan-600 via-blue-700 to-[#0B1F3A]',
  },
};

/**
 * Infiere el tipo de excursión a partir del título, descripción o etiquetas.
 */
export function inferirTipoProducto(nombre: string, etiquetas?: string[]): TipoProductoTurismo {
  const texto = `${nombre} ${(etiquetas ?? []).join(' ')}`.toLowerCase();

  // 1. Ecoturismo y reservas naturales (alta prioridad semántica)
  if (
    texto.includes('reserva') ||
    texto.includes('parque natural') ||
    texto.includes('manglar') ||
    texto.includes('selva') ||
    texto.includes('fauna') ||
    texto.includes('eco')
  ) {
    return 'reserva_natural';
  }

  // 2. Playas, islas y clubes de playa
  if (
    texto.includes('isla') ||
    texto.includes('playa') ||
    texto.includes('beach') ||
    texto.includes('cholon') ||
    texto.includes('rosario') ||
    texto.includes('baru')
  ) {
    return 'isla_beach_club';
  }

  // 3. Ciudades y cultura
  if (
    texto.includes('city') ||
    texto.includes('historico') ||
    texto.includes('ciudad') ||
    texto.includes('cultural') ||
    texto.includes('chiva') ||
    texto.includes('castillo')
  ) {
    return 'city_tour';
  }

  // 4. Náutica y aventura
  if (
    texto.includes('lancha') ||
    texto.includes('bote') ||
    texto.includes('yate') ||
    texto.includes('nautic') ||
    texto.includes('buceo') ||
    texto.includes('snorkel') ||
    texto.includes('pesca')
  ) {
    return 'aventura_nautica';
  }

  // 5. Acomodación y hotel
  if (
    texto.includes('hotel') ||
    texto.includes('acomodacion') ||
    texto.includes('noches') ||
    texto.includes('resort')
  ) {
    return 'paquete_hotel';
  }

  return 'excursion_general';
}

export interface ChipTipoProductoProps extends React.HTMLAttributes<HTMLSpanElement> {
  tipo?: TipoProductoTurismo;
  nombreReferencia?: string;
  etiquetas?: string[];
  tamano?: 'sm' | 'md';
}

/**
 * Chip temático para tipos de excursión (T-032 / T-036).
 * Asigna iconos y combinaciones de color caribeñas sin depender de fotos.
 */
export function ChipTipoProducto({
  tipo,
  nombreReferencia,
  etiquetas,
  tamano = 'md',
  className = '',
  ...resto
}: ChipTipoProductoProps) {
  const tipoFinal =
    tipo ??
    (nombreReferencia ? inferirTipoProducto(nombreReferencia, etiquetas) : 'excursion_general');
  const config = CONFIGURACIONES_TIPO_TURISMO[tipoFinal];
  const IconoComponent = config.icono;

  const clasesTamano = {
    sm: 'text-[10px] px-2 py-0.5 min-h-[22px]',
    md: 'text-xs px-2.5 py-1 min-h-[26px]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium shadow-2xs select-none ${config.colorFondo} ${config.colorTexto} ${config.colorBorde} ${clasesTamano[tamano]} ${className}`}
      {...resto}
    >
      <IconoComponent className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{config.etiqueta}</span>
    </span>
  );
}
