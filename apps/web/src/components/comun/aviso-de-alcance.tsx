import React from 'react';
import { Info, Lock } from 'lucide-react';
import { TEXTO_REPORTES_SOLO_ADMINISTRACION } from '../../lib/alcance-de-vista';

/** Estado «sin acceso» de Reportes: explica por qué, no regaña. Se usa en las dos pantallas. */
export function AvisoReportesDeAdministracion({ className = '' }: { className?: string }) {
  return (
    <div
      role="alert"
      data-testid="reportes-sin-permiso"
      className={`mx-auto flex max-w-md flex-col items-center gap-1 rounded-xl border border-neutral-200 bg-white p-4 text-center text-xs shadow-xs dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      <Lock className="h-5 w-5 text-neutral-500" aria-hidden="true" />
      <p className="font-semibold text-neutral-800 dark:text-neutral-100">
        {TEXTO_REPORTES_SOLO_ADMINISTRACION.titulo}
      </p>
      <p className="text-neutral-600 dark:text-neutral-300">
        {TEXTO_REPORTES_SOLO_ADMINISTRACION.detalle}
      </p>
    </div>
  );
}

/** Nota discreta cuando la lista muestra solo lo del asesor. */
export function AvisoSoloLoPropio({ texto, testId }: { texto: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      role="note"
      className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  );
}
