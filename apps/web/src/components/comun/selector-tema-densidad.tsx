'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Laptop, Maximize2, Minimize2, Check } from 'lucide-react';
import {
  type ModoTema,
  type DensidadVisual,
  cargarPreferenciasTema,
  guardarModoTema,
  guardarDensidadVisual,
  suscribirCambiosSistema,
  resolverTemaEfectivo,
  consultarPreferenciaSistemaOscuro,
} from '../../lib/tema-y-densidad';

export interface SelectorTemaDensidadProps {
  onCambio?: (tema: ModoTema, densidad: DensidadVisual) => void;
  className?: string;
  compacto?: boolean;
}

export function SelectorTemaDensidad({
  onCambio,
  className = '',
  compacto = false,
}: SelectorTemaDensidadProps) {
  const [tema, setTema] = useState<ModoTema>('system');
  const [densidad, setDensidad] = useState<DensidadVisual>('comoda');
  const [esOscuroEfectivo, setEsOscuroEfectivo] = useState(false);

  useEffect(() => {
    const prefs = cargarPreferenciasTema();
    setTema(prefs.tema);
    setDensidad(prefs.densidad);

    const sistemaOscuro = consultarPreferenciaSistemaOscuro();
    setEsOscuroEfectivo(resolverTemaEfectivo(prefs.tema, sistemaOscuro) === 'dark');

    // Escuchar si el sistema operativo cambia entre claro y oscuro
    const cancelar = suscribirCambiosSistema((sistemaEsOscuro) => {
      setEsOscuroEfectivo(resolverTemaEfectivo(prefs.tema, sistemaEsOscuro) === 'dark');
    });

    return () => cancelar();
  }, []);

  const manejarCambioTema = (nuevoTema: ModoTema) => {
    const actualizadas = guardarModoTema(nuevoTema);
    setTema(actualizadas.tema);
    const sistemaOscuro = consultarPreferenciaSistemaOscuro();
    setEsOscuroEfectivo(resolverTemaEfectivo(nuevoTema, sistemaOscuro) === 'dark');
    onCambio?.(actualizadas.tema, actualizadas.densidad);
  };

  const manejarCambioDensidad = (nuevaDensidad: DensidadVisual) => {
    const actualizadas = guardarDensidadVisual(nuevaDensidad);
    setDensidad(actualizadas.densidad);
    onCambio?.(actualizadas.tema, actualizadas.densidad);
  };

  return (
    <div className={`space-y-4 ${className}`} data-testid="selector-tema-densidad-contenedor">
      {/* 1. Selector de Tema (Claro / Oscuro / Sistema) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Tema Visual
          </span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {tema === 'system'
              ? `Sistema (${esOscuroEfectivo ? 'Oscuro activo' : 'Claro activo'})`
              : tema === 'dark'
                ? 'Modo Oscuro'
                : 'Modo Claro'}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Seleccionar tema visual"
          data-testid="grupo-radios-tema"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-neutral-200 bg-neutral-100/70 p-1 dark:border-neutral-800 dark:bg-neutral-800/60"
        >
          {/* Opción Claro */}
          <button
            type="button"
            role="radio"
            aria-checked={tema === 'light'}
            onClick={() => manejarCambioTema('light')}
            data-testid="opcion-tema-light"
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              tema === 'light'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            <Sun className="h-4 w-4 text-amber-500" />
            <span>Claro</span>
            {tema === 'light' && <Check className="h-3 w-3 text-neutral-500" />}
          </button>

          {/* Opción Oscuro */}
          <button
            type="button"
            role="radio"
            aria-checked={tema === 'dark'}
            onClick={() => manejarCambioTema('dark')}
            data-testid="opcion-tema-dark"
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              tema === 'dark'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            <Moon className="h-4 w-4 text-indigo-400" />
            <span>Oscuro</span>
            {tema === 'dark' && <Check className="h-3 w-3 text-neutral-500" />}
          </button>

          {/* Opción Sistema */}
          <button
            type="button"
            role="radio"
            aria-checked={tema === 'system'}
            onClick={() => manejarCambioTema('system')}
            data-testid="opcion-tema-system"
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              tema === 'system'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            <Laptop className="h-4 w-4 text-neutral-500" />
            <span>Sistema</span>
            {tema === 'system' && <Check className="h-3 w-3 text-neutral-500" />}
          </button>
        </div>
      </div>

      {/* 2. Selector de Densidad (Cómoda / Compacta) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            Densidad Visual
          </span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {densidad === 'compacta' ? 'Mayor información' : 'Espaciado estándar'}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Seleccionar densidad visual"
          data-testid="grupo-radios-densidad"
          className="grid grid-cols-2 gap-1.5 rounded-xl border border-neutral-200 bg-neutral-100/70 p-1 dark:border-neutral-800 dark:bg-neutral-800/60"
        >
          {/* Opción Cómoda */}
          <button
            type="button"
            role="radio"
            aria-checked={densidad === 'comoda'}
            onClick={() => manejarCambioDensidad('comoda')}
            data-testid="opcion-densidad-comoda"
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              densidad === 'comoda'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5 text-neutral-500" />
            <span>Cómoda</span>
            {densidad === 'comoda' && <Check className="h-3 w-3 text-neutral-500" />}
          </button>

          {/* Opción Compacta */}
          <button
            type="button"
            role="radio"
            aria-checked={densidad === 'compacta'}
            onClick={() => manejarCambioDensidad('compacta')}
            data-testid="opcion-densidad-compacta"
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              densidad === 'compacta'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            <Minimize2 className="h-3.5 w-3.5 text-neutral-500" />
            <span>Compacta</span>
            {densidad === 'compacta' && <Check className="h-3 w-3 text-neutral-500" />}
          </button>
        </div>
      </div>

      {!compacto && (
        <div className="flex items-center justify-between border-t border-neutral-200/60 pt-2.5 text-[10px] text-neutral-400 dark:border-neutral-800/60 dark:text-neutral-500">
          <span>Paleta Caribeña (Océano y Turquesa)</span>
          <span>Contraste WCAG 2.1 AA</span>
        </div>
      )}
    </div>
  );
}
