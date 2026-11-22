import React from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import type { NivelDeUrgenciaVentana } from '../../lib/ventana-24h';

const CLASE_BASE = 'py-0.2 inline-flex items-center gap-0.5 rounded px-1.5';

/**
 * Lo que queda de la ventana de 24 horas, en la fila de la bandeja. El color dice cuánto tiempo hay:
 * verde con margen, ámbar al acercarse (2 h), rojo al final (15 min) y gris cuando ya está cerrada.
 * Cerrada NO es un éxito, así que no usa el verde. Nunca solo color: el texto trae la hora y los
 * niveles de aviso llevan un icono y una etiqueta para el lector de pantalla.
 */
export function InsigniaDeVentanaEnFila({
  nivel,
  texto,
}: {
  nivel: NivelDeUrgenciaVentana;
  texto: string;
}) {
  if (nivel === 'cerrada') {
    return (
      <span
        data-testid="ventana-fila"
        data-nivel="cerrada"
        className={`${CLASE_BASE} bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400`}
      >
        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
        24h Cerrada
      </span>
    );
  }
  if (nivel === 'rojo') {
    return (
      <span
        data-testid="ventana-fila"
        data-nivel="rojo"
        className={`${CLASE_BASE} bg-alerta-50 text-alerta-800 dark:bg-alerta-950/60 dark:text-alerta-300 font-bold`}
      >
        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
        <span className="sr-only">Ventana a punto de cerrar: </span>
        {texto}
      </span>
    );
  }
  if (nivel === 'ambar') {
    return (
      <span
        data-testid="ventana-fila"
        data-nivel="ambar"
        className={`${CLASE_BASE} bg-amber-50 font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200`}
      >
        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
        <span className="sr-only">Ventana por cerrar: </span>
        {texto}
      </span>
    );
  }
  return (
    <span
      data-testid="ventana-fila"
      data-nivel="abierta"
      className={`${CLASE_BASE} bg-ok-50 text-ok-700 dark:bg-ok-950/40 dark:text-ok-400 font-semibold`}
    >
      {texto}
    </span>
  );
}
