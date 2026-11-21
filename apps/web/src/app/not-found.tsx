import React from 'react';
import Link from 'next/link';
import { Compass, Calculator, Package, ArrowLeft, GitFork } from 'lucide-react';

export const metadata = {
  title: '404 — Destino no encontrado | ViajaPro',
  description: 'La ruta solicitada no se encuentra en el mapa de viaje de ViajaPro.',
};

/**
 * Página 404 personalizada con identidad visual de turismo (T-109).
 *
 * Ofrece rutas de retorno claras y de alto valor para asesores comerciales
 * y clientes sin tecnicismos opacos.
 */
export default function NotFound() {
  return (
    <main
      role="main"
      className="flex min-h-[calc(100vh-120px)] w-full flex-col items-center justify-center bg-neutral-50 px-4 py-12 text-center select-none sm:px-6 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-lg space-y-6">
        {/* Insignia y Gráfico de Identidad Turística */}
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-sky-100 text-sky-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300">
          <Compass className="h-12 w-12 animate-pulse" aria-hidden="true" />
          <span className="text-2xs absolute -top-2 -right-2 rounded-full bg-amber-500 px-2 py-0.5 font-extrabold text-white shadow-xs">
            404
          </span>
        </div>

        {/* Títulos y Explicación en Español Claro */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-sky-700 dark:text-sky-400">
            Coordenadas extraviadas
          </p>
          <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl dark:text-white">
            Esta ruta no está en nuestro mapa
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            El destino, cotización o recurso que intentas consultar cambió de dirección, fue
            reubicado o nunca existió. Retoma tu itinerario desde nuestras secciones principales.
          </p>
        </div>

        {/* Botón Principal de Retorno */}
        <div className="pt-2">
          <Link
            href="/bandeja"
            data-testid="enlace-volver-bandeja"
            className="boton-primario inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-sm transition sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la Bandeja de WhatsApp</span>
          </Link>
        </div>

        {/* Salida sin sesión: la 404 pública (p. ej. bajo /terminos) no deja al asesor sin camino. */}
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          ¿Tu sesión se cerró?{' '}
          <Link
            href="/ingresar"
            data-testid="enlace-ir-a-ingresar"
            className="inline-flex min-h-[44px] items-center font-semibold text-sky-700 underline focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none dark:text-sky-400"
          >
            Ir a ingresar
          </Link>
        </p>

        {/* Accesos Rápidos de Navegación Turística */}
        <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            Rutas directas para tu agencia:
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Link
              href="/cotizador"
              data-testid="enlace-rapido-cotizador"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Calculator className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span>Cotizador</span>
            </Link>

            <Link
              href="/catalogo"
              data-testid="enlace-rapido-catalogo"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <Package className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Catálogo</span>
            </Link>

            <Link
              href="/pipeline"
              data-testid="enlace-rapido-pipeline"
              className="hover:border-acento-300 hover:bg-acento-50/50 hover:text-acento-800 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <GitFork className="text-acento-600 dark:text-acento-400 h-3.5 w-3.5" />
              <span>Pipeline</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
