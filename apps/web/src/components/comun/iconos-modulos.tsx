'use client';

import React from 'react';
import {
  MessageSquare,
  Kanban,
  FileText,
  Compass,
  Users,
  Plane,
  BarChart3,
  Settings,
} from 'lucide-react';

export type ModuloViajaPro =
  | 'bandeja'
  | 'pipeline'
  | 'cotizaciones'
  | 'catalogo'
  | 'contactos'
  | 'viajes'
  | 'reportes'
  | 'configuracion';

export interface ConfiguracionModulo {
  id: ModuloViajaPro;
  nombre: string;
  descripcion: string;
  icono: React.ComponentType<{ className?: string }>;
  colorHex: string;
  claseBgSuave: string;
  claseTexto: string;
  claseBorde: string;
}

export const CONFIGURACION_MODULOS: Record<ModuloViajaPro, ConfiguracionModulo> = {
  bandeja: {
    id: 'bandeja',
    nombre: 'Bandeja WhatsApp',
    descripcion: 'Atención omnicanal en tiempo real con ventana 24h',
    icono: MessageSquare,
    colorHex: '#06B6D4',
    claseBgSuave: 'bg-cyan-50 dark:bg-cyan-950/50',
    claseTexto: 'text-cyan-700 dark:text-cyan-300',
    claseBorde: 'border-cyan-200 dark:border-cyan-800/60',
  },
  pipeline: {
    id: 'pipeline',
    nombre: 'Pipeline Comercial',
    descripcion: 'Embudo de ventas y seguimiento de oportunidades',
    icono: Kanban,
    colorHex: '#2563EB',
    claseBgSuave: 'bg-blue-50 dark:bg-blue-950/50',
    claseTexto: 'text-blue-700 dark:text-blue-300',
    claseBorde: 'border-blue-200 dark:border-blue-800/60',
  },
  cotizaciones: {
    id: 'cotizaciones',
    nombre: 'Cotizador',
    descripcion: 'Cálculo de acomodación, margen y temporadas en vivo',
    icono: FileText,
    colorHex: '#D97706',
    claseBgSuave: 'bg-amber-50 dark:bg-amber-950/50',
    claseTexto: 'text-amber-700 dark:text-amber-300',
    claseBorde: 'border-amber-200 dark:border-amber-800/60',
  },
  catalogo: {
    id: 'catalogo',
    nombre: 'Catálogo de Excursiones',
    descripcion: 'Planes turísticos, salidas programadas y cupos',
    icono: Compass,
    colorHex: '#059669',
    claseBgSuave: 'bg-emerald-50 dark:bg-emerald-950/50',
    claseTexto: 'text-emerald-700 dark:text-emerald-300',
    claseBorde: 'border-emerald-200 dark:border-emerald-800/60',
  },
  contactos: {
    id: 'contactos',
    nombre: 'Directorio de Clientes',
    descripcion: 'Viajeros, historial comercial y protección PII',
    icono: Users,
    colorHex: '#4F46E5',
    claseBgSuave: 'bg-indigo-50 dark:bg-indigo-950/50',
    claseTexto: 'text-indigo-700 dark:text-indigo-300',
    claseBorde: 'border-indigo-200 dark:border-indigo-800/60',
  },
  viajes: {
    id: 'viajes',
    nombre: 'Archivos de Viaje',
    descripcion: 'Expedientes confirmados y vouchers de pasajeros',
    icono: Plane,
    colorHex: '#F43F5E',
    claseBgSuave: 'bg-rose-50 dark:bg-rose-950/50',
    claseTexto: 'text-rose-700 dark:text-rose-300',
    claseBorde: 'border-rose-200 dark:border-rose-800/60',
  },
  reportes: {
    id: 'reportes',
    nombre: 'Métricas y Cierres',
    descripcion: 'Reportes de comisiones, ventas y cumplimiento',
    icono: BarChart3,
    colorHex: '#7C3AED',
    claseBgSuave: 'bg-purple-50 dark:bg-purple-950/50',
    claseTexto: 'text-purple-700 dark:text-purple-300',
    claseBorde: 'border-purple-200 dark:border-purple-800/60',
  },
  configuracion: {
    id: 'configuracion',
    nombre: 'Configuración',
    descripcion: 'Parámetros del tenant, equipo y comisiones',
    icono: Settings,
    colorHex: '#475569',
    claseBgSuave: 'bg-slate-100 dark:bg-slate-800/50',
    claseTexto: 'text-slate-700 dark:text-slate-300',
    claseBorde: 'border-slate-200 dark:border-slate-700/60',
  },
};

export interface IconoModuloProps extends React.HTMLAttributes<HTMLDivElement> {
  modulo: ModuloViajaPro;
  tamano?: 'sm' | 'md' | 'lg';
  conBorde?: boolean;
}

/**
 * Icono de color en círculo suave representativo de cada módulo (T-032).
 */
export function IconoModulo({
  modulo,
  tamano = 'md',
  conBorde = true,
  className = '',
  ...resto
}: IconoModuloProps) {
  const config = CONFIGURACION_MODULOS[modulo];
  const IconComponent = config.icono;

  const clasesTamanoContenedor = {
    sm: 'h-8 w-8 rounded-lg',
    md: 'h-10 w-10 rounded-xl',
    lg: 'h-12 w-12 rounded-2xl',
  };

  const clasesTamanoIcono = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center ${config.claseBgSuave} ${config.claseTexto} ${
        conBorde ? `border ${config.claseBorde}` : ''
      } ${clasesTamanoContenedor[tamano]} ${className}`}
      aria-hidden="true"
      {...resto}
    >
      <IconComponent className={clasesTamanoIcono[tamano]} />
    </div>
  );
}
