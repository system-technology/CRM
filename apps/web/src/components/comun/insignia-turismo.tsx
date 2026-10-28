'use client';

import React from 'react';
import { Sparkles, Clock, Calendar, Users, Tag } from 'lucide-react';

export type VarianteInsignia = 'dorado' | 'turquesa' | 'coral' | 'atardecer' | 'resalte';

export interface InsigniaAroDoradoProps extends React.HTMLAttributes<HTMLSpanElement> {
  variante?: VarianteInsignia;
  icono?: 'reloj' | 'calendario' | 'cupos' | 'promo' | 'destello' | React.ReactElement;
  tamano?: 'sm' | 'md';
}

const ICONOS_PREDEFINIDOS = {
  reloj: Clock,
  calendario: Calendar,
  cupos: Users,
  promo: Tag,
  destello: Sparkles,
};

/**
 * Insignia con aro dorado distintivo de agencias de turismo (T-032).
 * Da jerarquía inmediata y elegancia caribeña a datos clave:
 * duración («1 día»), horarios («Salida 8:00 AM»), cupos libres y promociones.
 */
export function InsigniaAroDorado({
  children,
  variante = 'dorado',
  icono,
  tamano = 'md',
  className = '',
  ...resto
}: InsigniaAroDoradoProps) {
  const renderIcono = () => {
    if (!icono) return null;
    if (typeof icono === 'string' && icono in ICONOS_PREDEFINIDOS) {
      const IconComponent = ICONOS_PREDEFINIDOS[icono];
      return <IconComponent className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    }
    return <span className="flex shrink-0 items-center">{icono}</span>;
  };

  const estilosVariante = {
    dorado:
      'bg-amber-50 text-amber-950 border-[#C9A24B] shadow-[0_0_0_1px_rgba(201,162,75,0.25)] dark:bg-amber-950/50 dark:text-amber-200',
    turquesa:
      'bg-cyan-50 text-cyan-950 border-[#06B6D4] shadow-[0_0_0_1px_rgba(6,182,212,0.25)] dark:bg-cyan-950/50 dark:text-cyan-200',
    coral:
      'bg-rose-50 text-rose-950 border-[#FB7185] shadow-[0_0_0_1px_rgba(251,113,133,0.25)] dark:bg-rose-950/50 dark:text-rose-200',
    atardecer:
      'bg-orange-50 text-orange-950 border-[#F97316] shadow-[0_0_0_1px_rgba(249,115,22,0.25)] dark:bg-orange-950/50 dark:text-orange-200',
    resalte:
      'bg-[#FACC15] text-neutral-900 font-bold border-[#EAB308] shadow-[0_0_0_1px_rgba(234,179,8,0.3)]',
  };

  const estilosTamano = {
    sm: 'text-[10px] px-2 py-0.5 min-h-[22px]',
    md: 'text-xs px-2.5 py-1 min-h-[26px]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-transform select-none ${estilosVariante[variante]} ${estilosTamano[tamano]} ${className}`}
      {...resto}
    >
      {renderIcono()}
      <span>{children}</span>
    </span>
  );
}

export interface InsigniaPromoProps extends React.HTMLAttributes<HTMLSpanElement> {
  descuentoTexto?: string;
  resalte?: boolean;
}

/**
 * Insignia de promoción caribeña con destello y fondo amarillo o atardecer (T-032).
 */
export function InsigniaPromo({
  children,
  descuentoTexto,
  resalte = true,
  className = '',
  ...resto
}: InsigniaPromoProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase shadow-xs select-none ${
        resalte
          ? 'border border-amber-500/60 bg-[#FACC15] text-neutral-950'
          : 'degradado-atardecer border border-rose-400/40 text-white'
      } ${className}`}
      {...resto}
    >
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      {descuentoTexto && <span className="font-extrabold">{descuentoTexto}</span>}
      {children && <span>{children}</span>}
    </span>
  );
}

export interface InsigniaCuposVivosProps extends React.HTMLAttributes<HTMLSpanElement> {
  cupos: number | null | undefined;
  total?: number | null;
}

/**
 * Insignia de cupos en vivo con ping de estado y aro distintivo (T-032).
 */
export function InsigniaCuposVivos({
  cupos,
  total,
  className = '',
  ...resto
}: InsigniaCuposVivosProps) {
  if (cupos === null || cupos === undefined) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 ${className}`}
        {...resto}
      >
        <Users className="h-3 w-3 text-neutral-400" />
        <span>Cupos libres</span>
      </span>
    );
  }

  if (cupos <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 ${className}`}
        {...resto}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
        <span>Agotado</span>
      </span>
    );
  }

  const esPocoCupo = cupos <= 3;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        esPocoCupo
          ? 'border-[#C9A24B] bg-amber-50 text-amber-900 shadow-[0_0_0_1px_rgba(201,162,75,0.2)] dark:bg-amber-950/50 dark:text-amber-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200'
      } ${className}`}
      {...resto}
    >
      <span className="relative flex h-2 w-2">
        {esPocoCupo && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:animate-none" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            esPocoCupo ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
        />
      </span>
      <span>
        {cupos === 1
          ? '¡Último cupo!'
          : total
            ? `${cupos} de ${total} cupos`
            : `${cupos} cupos libres`}
      </span>
    </span>
  );
}
