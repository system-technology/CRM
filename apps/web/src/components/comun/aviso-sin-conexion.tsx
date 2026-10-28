'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

/**
 * Aviso flotante de pérdida de conexión y restauración en tiempo real (T-109).
 *
 * Advierte amablemente a los agentes de viajes cuando se cae la red y confirma
 * automáticamente cuando se recupera la conectividad con los servidores de ViajaPro.
 */
export function AvisoSinConexion() {
  const [estaEnLinea, setEstaEnLinea] = useState<boolean>(true);
  const [mostroRestablecido, setMostroRestablecido] = useState<boolean>(false);
  const [comprobando, setComprobando] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setEstaEnLinea(navigator.onLine);

    const alDesconectar = () => {
      setEstaEnLinea(false);
      setMostroRestablecido(false);
    };

    const alConectar = () => {
      setEstaEnLinea(true);
      setMostroRestablecido(true);
      const timer = setTimeout(() => {
        setMostroRestablecido(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', alDesconectar);
    window.addEventListener('online', alConectar);

    return () => {
      window.removeEventListener('offline', alDesconectar);
      window.removeEventListener('online', alConectar);
    };
  }, []);

  const verificarConexionManual = useCallback(async () => {
    setComprobando(true);
    try {
      // Intento rápido de ping ligero
      const respuesta = await fetch('/salud', { method: 'HEAD', cache: 'no-store' });
      if (respuesta.ok) {
        setEstaEnLinea(true);
        setMostroRestablecido(true);
        setTimeout(() => setMostroRestablecido(false), 3000);
      } else {
        setEstaEnLinea(false);
      }
    } catch {
      setEstaEnLinea(false);
    } finally {
      setComprobando(false);
    }
  }, []);

  if (estaEnLinea && !mostroRestablecido) {
    return null;
  }

  // Notificación de conexión restablecida
  if (estaEnLinea && mostroRestablecido) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="aviso-conexion-restablecida"
        className="animate-in fade-in slide-in-from-bottom-2 fixed right-4 bottom-4 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-lg duration-200 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      >
        <Wifi
          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span>Conexión restablecida con ViajaPro.</span>
      </div>
    );
  }

  // Banner persistente de sin conexión
  return (
    <div
      role="status"
      aria-live="assertive"
      data-testid="banner-sin-conexion"
      className="sticky top-0 z-50 w-full border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 shadow-xs select-none dark:border-amber-800/80 dark:bg-amber-950/90 dark:text-amber-200"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-200/80 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <p className="font-semibold">
            <strong className="font-bold">Estás trabajando sin conexión.</strong> Los datos
            mostrados pueden no estar actualizados.
          </p>
        </div>

        <button
          type="button"
          data-testid="btn-comprobar-conexion"
          disabled={comprobando}
          onClick={() => {
            void verificarConexionManual();
          }}
          className="text-2xs inline-flex min-h-[36px] min-w-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900 shadow-2xs transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
        >
          <RefreshCw
            className={`h-3 w-3 ${comprobando ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{comprobando ? 'Comprobando...' : 'Comprobar red'}</span>
        </button>
      </div>
    </div>
  );
}
