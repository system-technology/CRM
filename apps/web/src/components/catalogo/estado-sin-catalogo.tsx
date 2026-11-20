'use client';

import React from 'react';
import Link from 'next/link';
import { Compass, FileSpreadsheet, PlusCircle, Sparkles, MapPin, Upload, Eye } from 'lucide-react';

export interface EstadoSinCatalogoProps {
  onImportar?: () => void;
  hrefImportar?: string;
  onCrearExcursion?: () => void;
  hrefCrear?: string;
  onVerDemo?: () => void;
  contexto?: 'catalogo' | 'cotizador';
}

/**
 * Estado vacío para cuando el tenant aún no tiene paquetes ni salidas registradas (T-019).
 * Guía al usuario con dos acciones principales: «Importar catálogo» y «Crear excursión».
 */
export function EstadoSinCatalogo({
  onImportar,
  hrefImportar = '/catalogo',
  onCrearExcursion,
  hrefCrear = '/catalogo/gestion',
  onVerDemo,
  contexto = 'catalogo',
}: EstadoSinCatalogoProps) {
  const esCotizador = contexto === 'cotizador';

  return (
    <div
      data-testid="estado-sin-catalogo"
      className="border-acento-200 from-acento-50/50 dark:border-acento-900/60 dark:from-acento-950/20 relative overflow-hidden rounded-3xl border border-dashed bg-gradient-to-b via-white to-sky-50/30 p-8 text-center shadow-xs sm:p-12 dark:via-neutral-900 dark:to-sky-950/10"
    >
      {/* Elementos decorativos de fondo */}
      <div className="bg-acento-400/10 pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full blur-2xl" />
      <div className="pointer-events-none absolute -right-12 -bottom-12 h-40 w-40 rounded-full bg-sky-400/10 blur-2xl" />

      {/* Ícono central */}
      <div className="from-acento-500 shadow-acento-500/20 relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br to-cyan-600 text-white shadow-lg">
        <Compass className="h-10 w-10 animate-pulse" />
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-xs">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* Textos explicativos */}
      <div className="relative mx-auto mt-6 max-w-lg">
        <div className="bg-acento-100/80 text-acento-800 dark:bg-acento-950/80 dark:text-acento-300 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
          <MapPin className="h-3.5 w-3.5" />
          <span>Tu agencia lista para vender</span>
        </div>

        <h2 className="mt-3 text-xl font-extrabold tracking-tight text-neutral-900 sm:text-2xl dark:text-white">
          {esCotizador
            ? 'No hay excursiones ni salidas registradas en esta agencia'
            : 'Tu agencia aún no tiene catálogo publicado'}
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm dark:text-neutral-400">
          {esCotizador
            ? 'La agencia activa no cuenta con excursiones de un día ni salidas publicadas en la API. Puedes importar tu catálogo con CSV, crear una excursión manualmente o activar el modo demostración para explorar.'
            : 'Empieza publicando tus pasadías y viajes. Puedes cargar tu tarifario masivamente con una plantilla CSV o registrar tu primera excursión manualmente.'}
        </p>
      </div>

      {/* Acciones principales destacadas (T-019) */}
      <div className="relative mt-8 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row">
        {onVerDemo && (
          <button
            type="button"
            onClick={onVerDemo}
            className="boton-primario flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold shadow-md transition-all active:scale-98 sm:w-auto"
          >
            <Eye className="h-4 w-4" />
            <span>Ver excursiones de demostración</span>
          </button>
        )}

        {onImportar ? (
          <button
            type="button"
            onClick={onImportar}
            data-testid="btn-sin-catalogo-importar"
            className="boton-primario flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold shadow-md transition-all active:scale-98 sm:w-auto"
          >
            <Upload className="h-4 w-4" />
            <span>Importar catálogo (CSV)</span>
          </button>
        ) : (
          <Link
            href={hrefImportar}
            data-testid="btn-sin-catalogo-importar"
            className="boton-primario flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold shadow-md transition-all active:scale-98 sm:w-auto"
          >
            <Upload className="h-4 w-4" />
            <span>Importar catálogo (CSV)</span>
          </Link>
        )}

        {onCrearExcursion ? (
          <button
            type="button"
            onClick={onCrearExcursion}
            data-testid="btn-sin-catalogo-crear"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-5 py-3 text-xs font-bold text-neutral-800 shadow-2xs transition-all hover:bg-neutral-50 active:scale-98 sm:w-auto dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <PlusCircle className="text-acento-600 dark:text-acento-400 h-4 w-4" />
            <span>Crear excursión</span>
          </button>
        ) : (
          <Link
            href={hrefCrear}
            data-testid="btn-sin-catalogo-crear"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-5 py-3 text-xs font-bold text-neutral-800 shadow-2xs transition-all hover:bg-neutral-50 active:scale-98 sm:w-auto dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <PlusCircle className="text-acento-600 dark:text-acento-400 h-4 w-4" />
            <span>Crear excursión</span>
          </Link>
        )}
      </div>

      {/* Sugerencia amigable */}
      <div className="relative mt-8 flex items-center justify-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
        <FileSpreadsheet className="h-3.5 w-3.5 text-neutral-400" />
        <span>Formatos admitidos: Excursión 1 día, Terrestre multidía y Aéreo</span>
      </div>
    </div>
  );
}
