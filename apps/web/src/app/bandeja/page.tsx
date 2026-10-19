'use client';

import React from 'react';
import { MessageSquare, Search, CornerDownLeft, CheckCircle2 } from 'lucide-react';

export default function BandejaCentralVaciaPage() {
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

        {/* Guía rápida de atajos de teclado */}
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
            Atajos de teclado frecuentes
          </h3>
          <div className="mt-2.5 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-neutral-400" />
                <span>Enfocar buscador</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                /
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CornerDownLeft className="h-3.5 w-3.5 text-neutral-400" />
                <span>Responder rápido</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                r
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-neutral-400" />
                <span>Resolver conversación</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                c
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
