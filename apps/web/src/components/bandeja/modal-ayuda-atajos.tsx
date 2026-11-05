'use client';

import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  X,
  Check,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Navigation,
  Send,
} from 'lucide-react';
import {
  CATALOGO_ATAJOS_BANDEJA,
  usePreferenciaAtajosTeclado,
} from '../../lib/atajos-teclado-bandeja';

interface ModalAyudaAtajosProps {
  abierto: boolean;
  onCerrar: () => void;
}

export function ModalAyudaAtajos({ abierto, onCerrar }: ModalAyudaAtajosProps) {
  const { atajosHabilitados, alternarAtajos } = usePreferenciaAtajosTeclado();
  const botonCerrarRef = useRef<HTMLButtonElement | null>(null);

  // Cerrar al pulsar Escape
  useEffect(() => {
    if (!abierto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCerrar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto, onCerrar]);

  // Enfocar el botón de cerrar al abrir
  useEffect(() => {
    if (abierto) {
      setTimeout(() => {
        botonCerrarRef.current?.focus();
      }, 50);
    }
  }, [abierto]);

  if (!abierto) return null;

  const navegacion = CATALOGO_ATAJOS_BANDEJA.filter((a) => a.categoria === 'navegacion');
  const acciones = CATALOGO_ATAJOS_BANDEJA.filter((a) => a.categoria === 'accion');
  const ayuda = CATALOGO_ATAJOS_BANDEJA.filter((a) => a.categoria === 'ayuda');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-ayuda-atajos"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl transition-all dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera */}
        <div className="flex items-start justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="bg-acento-50 text-acento-600 dark:bg-acento-950/60 dark:text-acento-400 flex h-10 w-10 items-center justify-center rounded-xl">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-ayuda-atajos"
                className="text-base font-bold text-neutral-900 dark:text-neutral-100"
              >
                Atajos de teclado en la bandeja
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Atiende consultas rápidamente sin separar las manos del teclado
              </p>
            </div>
          </div>
          <button
            ref={botonCerrarRef}
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar modal de ayuda"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preferencia de activación */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div>
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              Habilitar atajos de teclado
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Desactívalos si prefieres que las teclas sueltas no realicen acciones
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={atajosHabilitados}
            aria-label="Alternar habilitación de atajos de teclado"
            onClick={alternarAtajos}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              atajosHabilitados
                ? 'bg-acento-600 hover:bg-acento-700 text-white'
                : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200'
            }`}
          >
            {atajosHabilitados ? (
              <>
                <ToggleRight className="h-4 w-4" />
                <span>Activos</span>
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4" />
                <span>Inactivos</span>
              </>
            )}
          </button>
        </div>

        {/* Listado de atajos */}
        <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {/* Navegación */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              <Navigation className="h-3 w-3" />
              <span>Navegación</span>
            </div>
            <div className="mt-1.5 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-neutral-50/30 px-3 py-1 dark:divide-neutral-800/60 dark:border-neutral-800 dark:bg-neutral-800/20">
              {navegacion.map((item) => (
                <div key={item.tecla} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">{item.descripcion}</span>
                  <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-neutral-800 shadow-2xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {item.etiquetaTecla}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Acciones */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              <Send className="h-3 w-3" />
              <span>Acciones rápidas</span>
            </div>
            <div className="mt-1.5 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-neutral-50/30 px-3 py-1 dark:divide-neutral-800/60 dark:border-neutral-800 dark:bg-neutral-800/20">
              {acciones.map((item) => (
                <div key={item.tecla} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">{item.descripcion}</span>
                  <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-neutral-800 shadow-2xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {item.etiquetaTecla}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Ayuda y sistema */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              <Sparkles className="h-3 w-3" />
              <span>General</span>
            </div>
            <div className="mt-1.5 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-neutral-50/30 px-3 py-1 dark:divide-neutral-800/60 dark:border-neutral-800 dark:bg-neutral-800/20">
              {ayuda.map((item) => (
                <div key={item.tecla} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-neutral-700 dark:text-neutral-300">{item.descripcion}</span>
                  <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-neutral-800 shadow-2xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {item.etiquetaTecla}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nota accesible al pie */}
        <div className="mt-4 rounded-lg bg-neutral-100/70 p-2.5 text-[11px] text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
          💡 <strong>Nota:</strong> Los atajos no se activan mientras escribes dentro de campos de
          texto, redacción de mensajes o búsquedas.
        </div>

        {/* Pie con botón de cierre */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <Check className="h-4 w-4" />
            <span>Entendido</span>
          </button>
        </div>
      </div>
    </div>
  );
}
