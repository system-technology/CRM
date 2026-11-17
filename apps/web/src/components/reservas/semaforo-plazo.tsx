import React from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { SemaforoDePlazo } from '@viajapro/contracts';
import { ETIQUETA_SEMAFORO } from '../../lib/archivos-logica';

const ESTILOS: Record<SemaforoDePlazo, string> = {
  VENCIDO:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200',
  MENOS_DE_24_H:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
  EN_PLAZO:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
};

const ICONOS = { VENCIDO: AlertTriangle, MENOS_DE_24_H: Clock, EN_PLAZO: CheckCircle2 } as const;

/** Semáforo de un plazo: el estado va en texto e icono, nunca solo en el color. */
export function SemaforoPlazo({ semaforo }: { semaforo: SemaforoDePlazo | null }) {
  if (!semaforo) return null;
  const Icono = ICONOS[semaforo];
  return (
    <span
      data-testid="semaforo-plazo"
      data-semaforo={semaforo}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ESTILOS[semaforo]}`}
    >
      <Icono className="h-3 w-3" aria-hidden="true" />
      {ETIQUETA_SEMAFORO[semaforo]}
    </span>
  );
}
