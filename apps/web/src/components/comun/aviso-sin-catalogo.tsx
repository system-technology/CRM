'use client';

/**
 * Estado vacío «sin catálogo todavía» (T-019)
 *
 * Guía al usuario y asesor cuando el tenant no tiene excursiones ni salidas registradas.
 * Proporciona dos acciones claras obligatorias:
 * 1. «Importar catálogo» (para carga masiva Excel / CSV)
 * 2. «Crear excursión» (para alta manual en panel)
 * Ambas acciones conducen a las rutas del catálogo o muestran aviso accesible explicativo.
 * Incluye opción de activar modo demostración para explorar el CRM con datos reales de muestra.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { UploadCloud, PlusCircle, Compass, Eye, Info, Sparkles } from 'lucide-react';

export interface AvisoSinCatalogoProps {
  pantalla?: 'catalogo' | 'cotizador';
  testId?: string;
  onVerDemo?: () => void;
  onReintentar?: () => void;
  rutaImportar?: string;
  rutaCrear?: string;
}

export function AvisoSinCatalogo({
  pantalla = 'catalogo',
  testId = 'estado-sin-catalogo',
  onVerDemo,
  rutaImportar,
  rutaCrear,
}: AvisoSinCatalogoProps) {
  const [avisoAccion, setAvisoAccion] = useState<string | null>(null);

  const tieneRutaImportar = Boolean(rutaImportar);
  const tieneRutaCrear = Boolean(rutaCrear);

  const mensajeExplicativo =
    pantalla === 'cotizador'
      ? 'La agencia activa no cuenta con excursiones de un día ni salidas publicadas en la API. Carga tu portafolio de excursiones o importa tu tarifario para armar propuestas comerciales y cotizaciones por WhatsApp.'
      : 'Tu agencia aún no tiene excursiones ni salidas cargadas en su catálogo oficial. Carga tu portafolio o importa tu tarifario para comenzar a cotizar salidas a tus clientes.';

  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-xs sm:p-10 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Icono temático */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-8 ring-teal-50/50 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-950/30">
        <Compass className="h-8 w-8" />
      </div>

      {/* Título principal */}
      <h2 className="mt-5 text-base font-bold tracking-tight text-neutral-900 sm:text-lg dark:text-white">
        No hay excursiones ni salidas registradas en esta agencia
      </h2>

      {/* Explicación de valor para el asesor */}
      <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-neutral-600 sm:text-sm dark:text-neutral-400">
        {mensajeExplicativo}
      </p>

      {/* Notificación informativa contextual al presionar acciones en preparación */}
      {avisoAccion && (
        <div
          role="status"
          data-testid="aviso-accion-catalogo"
          className="mt-4 flex max-w-md items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{avisoAccion}</span>
        </div>
      )}

      {/* Acciones principales obligatorias según T-019 */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {/* Acción 1: Importar catálogo */}
        {tieneRutaImportar ? (
          <Link
            href={rutaImportar!}
            data-testid="accion-importar-catalogo"
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Importar catálogo</span>
          </Link>
        ) : (
          <button
            type="button"
            data-testid="accion-importar-catalogo"
            onClick={() =>
              setAvisoAccion(
                'Importación de catálogo: carga masiva de excursiones desde archivo Excel o CSV disponible en la siguiente fase (bloque 3).',
              )
            }
            title="Importación por archivo Excel o CSV"
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden dark:bg-teal-600 dark:hover:bg-teal-700"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Importar catálogo</span>
            <span className="rounded-md bg-teal-800/80 px-1.5 py-0.5 text-[10px] font-normal tracking-wide text-teal-100">
              Pronto
            </span>
          </button>
        )}

        {/* Acción 2: Crear excursión */}
        {tieneRutaCrear ? (
          <Link
            href={rutaCrear!}
            data-testid="accion-crear-excursion"
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 focus:ring-2 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Crear excursión</span>
          </Link>
        ) : (
          <button
            type="button"
            data-testid="accion-crear-excursion"
            onClick={() =>
              setAvisoAccion(
                'Crear excursión: el formulario de alta manual de excursiones y tarifas se habilitará con el gestor de catálogo (bloque 3).',
              )
            }
            title="Alta manual de excursiones y tarifas"
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 focus:ring-2 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Crear excursión</span>
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
              Pronto
            </span>
          </button>
        )}

        {/* Acción 3: Ver excursiones de demostración */}
        {onVerDemo && (
          <button
            type="button"
            data-testid="accion-ver-demo"
            onClick={onVerDemo}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-400 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Eye className="h-4 w-4 text-neutral-500" />
            <span>Ver excursiones de demostración</span>
          </button>
        )}
      </div>

      {/* Nota al pie */}
      <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Formatos compatibles: Excel (.xlsx), CSV y tarifarios de mayoristas</span>
      </div>
    </div>
  );
}
