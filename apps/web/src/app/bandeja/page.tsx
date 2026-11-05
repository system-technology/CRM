'use client';

import React, { useEffect } from 'react';
import { MessageSquare, Navigation, FileText, Send, Sparkles, HelpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useBandejaAtajos, debeProcesarAtajo } from '../../lib/atajos-teclado-bandeja';

export default function BandejaCentralVaciaPage() {
  const router = useRouter();
  const { conversaciones, setModalAyudaAbierto, atajosHabilitados } = useBandejaAtajos();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!debeProcesarAtajo(e, atajosHabilitados)) {
        return;
      }

      if (e.key === 'j' || e.key === 'J') {
        if (conversaciones.length > 0 && conversaciones[0]?.id) {
          e.preventDefault();
          router.push(`/bandeja/${conversaciones[0].id}`);
        }
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setModalAyudaAbierto(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [conversaciones, atajosHabilitados, router, setModalAyudaAbierto]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-50/50 p-8 text-center select-none dark:bg-neutral-900/40">
      <div className="max-w-md space-y-4">
        {/* Icono central */}
        <div className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 mx-auto flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm">
          <MessageSquare className="h-8 w-8" />
        </div>

        {/* Título y descripción */}
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Elige una conversación para empezar
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Selecciona una consulta de la lista para atender al cliente en tiempo real, generar
            cotizaciones de paquetes y consultar el contexto comercial de CRM.
          </p>
        </div>

        {/* Guía rápida de atajos de teclado (T-127) */}
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              Atajos de teclado frecuentes
            </h3>
            <button
              type="button"
              onClick={() => setModalAyudaAbierto(true)}
              className="text-acento-600 hover:text-acento-700 dark:text-acento-400 flex items-center gap-1 text-[11px] font-semibold"
            >
              <HelpCircle className="h-3 w-3" />
              <span>Ver todos</span>
              <kbd className="py-0.2 rounded border border-neutral-200 bg-neutral-100 px-1 font-mono text-[9px] dark:border-neutral-700 dark:bg-neutral-800">
                ?
              </kbd>
            </button>
          </div>

          <div className="mt-3 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Navigation className="h-3.5 w-3.5 text-neutral-400" />
                <span>Navegar conversaciones</span>
              </span>
              <div className="flex gap-1">
                <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  j
                </kbd>
                <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  k
                </kbd>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Send className="h-3.5 w-3.5 text-neutral-400" />
                <span>Enfocar redacción</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                r
              </kbd>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-neutral-400" />
                <span>Enviar cotización</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                c
              </kbd>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-neutral-400" />
                <span>Crear seguimiento / oportunidad</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                s
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
