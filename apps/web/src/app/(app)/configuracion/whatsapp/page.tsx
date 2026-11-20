'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronLeft, MessageSquare, Sparkles } from 'lucide-react';
import { BloqueConexionWhatsapp } from '../../../../components/configuracion/bloque-conexion-whatsapp';

export default function ConfiguracionWhatsappPage() {
  return (
    <>
      <div className="flex flex-1 flex-col bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {/* Cabecera Principal */}
        <header className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/configuracion"
                  data-testid="btn-volver-configuracion"
                  className="flex min-h-[44px] items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Configuración General</span>
                </Link>
                <span className="text-neutral-300 dark:text-neutral-700">/</span>
                <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  WhatsApp
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  Conexión Oficial de WhatsApp
                </h1>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Estado de tu número de WhatsApp Business y la regla de la ventana de 24 horas
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/bienvenida"
                data-testid="btn-abrir-onboarding-desde-whatsapp"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>Asistente de Inicio</span>
              </Link>
              <Link
                href="/inbox"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Ir a Bandeja de WhatsApp</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Contenido Principal */}
        <div className="flex-1 p-6">
          <BloqueConexionWhatsapp />
        </div>
      </div>
    </>
  );
}
