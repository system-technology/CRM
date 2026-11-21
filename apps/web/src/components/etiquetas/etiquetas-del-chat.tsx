'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, Plus, RefreshCw, X } from 'lucide-react';
import type { EtiquetaDeConversacion } from '@viajapro/contracts';
import { useEtiquetasDeLaAgencia } from '../../lib/use-catalogo-de-etiquetas';
import { useEtiquetasDeConversacion } from '../../lib/use-etiquetas-de-conversacion';
import { explicacionFaltaPermiso } from '../../lib/permisos';
import { ChipDeEtiqueta } from './chip-de-etiqueta';
import { PanelDeEtiquetas } from './panel-de-etiquetas';

export interface EtiquetasDelChatProps {
  conversacionId: string;
  etiquetas: readonly EtiquetaDeConversacion[];
  /** El dueño de la lista (el detalle de la conversación) aplica el cambio, optimista o confirmado. */
  alCambiar: (etiquetas: EtiquetaDeConversacion[]) => void;
  /** `bandeja.operar`: sin él los chips se ven pero no se ponen ni se quitan. */
  puedeOperar: boolean;
  /** `etiquetas.administrar`: «Gestionar etiquetas» en el selector. */
  puedeAdministrar: boolean;
  /** Conversación retirada: solo lectura. */
  deshabilitado?: boolean;
  /** Controlado para que el atajo `e` del chat pueda abrir el selector. */
  abierto: boolean;
  alCambiarAbierto: (abierto: boolean) => void;
}

/**
 * La tira de etiquetas bajo la cabecera del chat (HU-inbox-1 §4.2): los chips de la conversación con
 * su «×» (un toque quita) y «+ Etiqueta» (dos toques ponen). Todo es optimista; si el servidor
 * rechaza, la etiqueta vuelve a su sitio y un aviso dice qué pasó y qué hacer.
 */
export function EtiquetasDelChat({
  conversacionId,
  etiquetas,
  alCambiar,
  puedeOperar,
  puedeAdministrar,
  deshabilitado = false,
  abierto,
  alCambiarAbierto,
}: EtiquetasDelChatProps) {
  const catalogo = useEtiquetasDeLaAgencia();
  const { alternar, pendientes, aviso, descartarAviso, reintentar } = useEtiquetasDeConversacion({
    conversacionId,
    etiquetas,
    alCambiar,
    catalogo: catalogo.etiquetas,
    alNoExistir: () => void catalogo.recargar(),
  });

  // Al abrir el selector se revalida el catálogo: si otra persona borró o creó una, se ve ya.
  const { recargar } = catalogo;
  useEffect(() => {
    if (abierto) void recargar();
  }, [abierto, recargar]);

  const operable = puedeOperar && !deshabilitado;
  const ids = new Set(etiquetas.map((e) => e.id));

  // Sin permiso y sin etiquetas no hay nada que mostrar: la cabecera no reserva la tira.
  if (!operable && etiquetas.length === 0) return null;

  return (
    <div
      data-testid="etiquetas-del-chat"
      className="shrink-0 border-b border-neutral-200 bg-white px-2.5 py-1 sm:px-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="relative flex min-h-[44px] min-w-0 flex-wrap items-center gap-x-1.5 gap-y-5 py-1.5 md:min-h-[32px] md:gap-y-1 md:py-0">
        <span className="sr-only">Etiquetas de la conversación</span>
        {etiquetas.map((e) => (
          <ChipDeEtiqueta
            key={e.id}
            etiqueta={e}
            ocupada={pendientes.has(e.id)}
            {...(operable ? { onQuitar: () => alternar(e) } : {})}
          />
        ))}

        {operable && (
          <span className="relative">
            <button
              type="button"
              onClick={() => alCambiarAbierto(!abierto)}
              aria-label="Agregar etiqueta"
              aria-haspopup="dialog"
              aria-expanded={abierto}
              data-testid="boton-agregar-etiqueta"
              className="focus-visible:ring-acento-600 text-acento-700 dark:text-acento-300 border-acento-700/40 hover:bg-acento-50 dark:hover:bg-acento-950/40 inline-flex min-h-[44px] items-center gap-1 rounded-full border border-dashed px-3 text-[11px] font-semibold focus-visible:ring-2 focus-visible:outline-none md:min-h-[24px] md:px-2"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Etiqueta
            </button>
            {abierto && (
              <PanelDeEtiquetas
                titulo="Etiquetas"
                catalogo={catalogo}
                seleccionadas={ids}
                pendientes={pendientes}
                onAlternar={(e) => alternar(e)}
                onCerrar={() => alCambiarAbierto(false)}
                puedeAdministrar={puedeAdministrar}
                testId="selector-de-etiquetas"
                alineacion="izquierda"
              />
            )}
          </span>
        )}

        {!puedeOperar && etiquetas.length > 0 && (
          <span
            title={explicacionFaltaPermiso('bandeja.operar')}
            className="text-[11px] text-neutral-500 dark:text-neutral-400"
          >
            Solo lectura
          </span>
        )}
      </div>

      {aviso && (
        <div
          role="alert"
          data-testid="aviso-de-etiqueta"
          className="border-aviso-600/40 bg-aviso-50 text-aviso-700 mt-1 mb-1 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 font-medium">{aviso.mensaje}</p>
          {aviso.intento && (
            <button
              type="button"
              onClick={reintentar}
              data-testid="reintentar-etiqueta"
              className="focus-visible:ring-acento-600 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 font-bold underline focus-visible:ring-2 focus-visible:outline-none md:min-h-[28px]"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              Reintentar
            </button>
          )}
          <button
            type="button"
            onClick={descartarAviso}
            aria-label="Cerrar aviso de etiqueta"
            className="focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none md:min-h-[28px] md:min-w-[28px]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
