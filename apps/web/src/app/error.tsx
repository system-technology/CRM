'use client';

import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  WifiOff,
  Lock,
  RotateCcw,
  Home,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { clasificarErrorSistema } from '../lib/errores-sistema';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Capturador global de errores de la aplicación con identidad visual de turismo (T-109).
 *
 * Clasifica honestamente los fallos (sesión expirada, pérdida de red, servidor, acceso denegado)
 * en español claro para los asesores comerciales y conserva la ruta de destino al expirar la sesión.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const pathname = usePathname();
  const router = useRouter();

  const info = useMemo(
    () => clasificarErrorSistema(error, undefined, pathname || '/bandeja'),
    [error, pathname],
  );

  useEffect(() => {
    // Registro del error en consola del cliente (sin filtrar secretos de backend)
    console.error('[ViajaPro Error Boundary]:', error?.message || error);
  }, [error]);

  const seleccionarIcono = () => {
    switch (info.tipo) {
      case 'SIN_CONEXION':
        return (
          <WifiOff className="h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        );
      case 'SESION_EXPIRADA':
        return <Lock className="h-10 w-10 text-sky-600 dark:text-sky-400" aria-hidden="true" />;
      case 'ACCESO_DENEGADO':
        return (
          <ShieldAlert className="h-10 w-10 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        );
      default:
        return (
          <AlertTriangle
            className="h-10 w-10 text-rose-600 dark:text-rose-400"
            aria-hidden="true"
          />
        );
    }
  };

  return (
    <main
      role="main"
      className="flex min-h-[calc(100vh-120px)] w-full flex-col items-center justify-center bg-neutral-50 px-4 py-12 text-center select-none sm:px-6 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-lg space-y-6">
        {/* Ícono de Estado Contextual */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          {seleccionarIcono()}
        </div>

        {/* Mensaje Amigable en Español */}
        <div className="space-y-2">
          <span className="text-2xs inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 font-extrabold tracking-wider text-neutral-600 uppercase dark:bg-neutral-800 dark:text-neutral-300">
            {info.codigo}
          </span>
          <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl dark:text-white">
            {info.titulo}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{info.mensaje}</p>
          <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {info.sugerencia}
          </p>
        </div>

        {/* Acciones de Recuperación */}
        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          {info.tipo === 'SESION_EXPIRADA' && info.redireccionSugerida ? (
            <button
              type="button"
              data-testid="btn-ir-ingreso"
              onClick={() => router.push(info.redireccionSugerida!)}
              className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:w-auto"
            >
              <span>{info.accionTexto}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <>
              {info.puedeReintentar && (
                <button
                  type="button"
                  data-testid="btn-reintentar"
                  onClick={() => reset()}
                  className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:w-auto"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>{info.accionTexto}</span>
                </button>
              )}

              <Link
                href="/bandeja"
                data-testid="btn-volver-bandeja"
                className="inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-bold text-neutral-700 shadow-2xs transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:w-auto dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                <span>Ir a la Bandeja</span>
              </Link>
            </>
          )}
        </div>

        {/* Referencia Técnica (Digest) sin filtrar stack trace ni secretos */}
        {error?.digest && (
          <div className="pt-4 text-center">
            <span className="text-2xs font-mono text-neutral-400">
              Ref. Incidencia: {error.digest}
            </span>
          </div>
        )}
      </div>
    </main>
  );
}
