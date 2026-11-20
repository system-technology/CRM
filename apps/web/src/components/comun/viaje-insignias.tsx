import React from 'react';
import { Clock } from 'lucide-react';
import type { NivelDePlazo, PlazoDelViaje } from '../../lib/viaje-solicitado-logica';

/**
 * Colores por urgencia, con texto siempre (nunca solo color): rojo para lo vencido y lo que vence
 * hoy, ámbar para lo próximo, neutro para el resto. Todos con contraste AA sobre su fondo.
 */
export const CLASES_POR_NIVEL: Record<NivelDePlazo | 'sin-fecha', string> = {
  vencido: 'bg-alerta-50 text-alerta-700',
  hoy: 'bg-alerta-50 text-alerta-700',
  proximo: 'bg-aviso-50 text-aviso-700',
  normal: 'bg-neutral-100 text-neutral-700',
  'sin-fecha': 'bg-neutral-100 text-neutral-600',
};

/** «Time limit mañana»: el plazo más próximo del viaje, como insignia pequeña. */
export function InsigniaDePlazo({ plazo }: { plazo: PlazoDelViaje }) {
  return (
    <span
      data-testid="insignia-plazo"
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${CLASES_POR_NIVEL[plazo.nivel]}`}
    >
      <Clock className="h-2.5 w-2.5" aria-hidden="true" />
      <span>
        {plazo.etiqueta} {plazo.cuando}
      </span>
    </span>
  );
}
