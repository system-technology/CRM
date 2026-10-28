'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { AsistenteOnboarding } from '../../components/onboarding/asistente-onboarding';
import { usePermisos } from '../../lib/permisos';

export default function BienvenidaPage() {
  const { sesion } = usePermisos();

  const agenciaActiva =
    sesion?.agencias?.find((a) => a.id === sesion.tenantActivoId)?.nombre ?? 'Tu Agencia de Viajes';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      {/* Barra de Módulos Lateral */}
      <BarraModulos />

      {/* Contenido Principal con Scroll */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-10">
        {/* Cabecera Superior */}
        <header className="border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800"
                title="Volver al inicio"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                    Asistente de Inicio de Agencia
                  </h2>
                  <DistintivoDatosDemo visible={true} />
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Configuración paso a paso de tu cuenta en ViajaPro
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                <Building2 className="h-3.5 w-3.5" />
                <span>{agenciaActiva}</span>
              </span>
            </div>
          </div>
        </header>

        {/* Cuerpo del Asistente */}
        <div className="flex-1 p-6 sm:p-8">
          <AsistenteOnboarding
            tenantId={sesion?.tenantActivoId ?? null}
            nombreAgencia={agenciaActiva}
          />
        </div>
      </main>
    </div>
  );
}
