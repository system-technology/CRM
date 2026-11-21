'use client';

/**
 * Poner y quitar etiquetas de UNA conversación con un toque, de forma optimista (T-326, HU §4.2):
 * el chip aparece o desaparece al toque; si el servidor rechaza, vuelve a su estado y un aviso dice
 * qué pasó y qué hacer. La API es idempotente (PUT/DELETE), así que reintentar nunca duplica.
 *
 * El dueño de la lista de etiquetas es quien llama (el detalle de la conversación): el hook recibe
 * la lista actual y un `alCambiar`, y se apoya en referencias para que una respuesta tardía no pise
 * lo que hay ahora ni se aplique a OTRA conversación si ya se cambió de chat.
 *
 * R10: nada de lo que pasa aquí escribe el nombre de una etiqueta en un log ni en la consola.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_ETIQUETAS_POR_CONVERSACION,
  type Etiqueta,
  type EtiquetaDeConversacion,
} from '@viajapro/contracts';
import { etiquetasApi } from './etiquetas-api';
import { publicarEtiquetasDeConversacion } from './etiquetas-eventos';
import {
  aEtiquetaDeConversacion,
  conEtiqueta,
  interpretarErrorDeEtiqueta,
  ordenarSegunCatalogo,
  reponerEtiqueta,
  type AvisoDeEtiqueta,
} from './etiquetas-logica';

export interface OpcionesEtiquetasDeConversacion {
  conversacionId: string;
  /** Las etiquetas que tiene la conversación ahora (las del detalle). */
  etiquetas: readonly EtiquetaDeConversacion[];
  alCambiar: (etiquetas: EtiquetaDeConversacion[]) => void;
  catalogo: readonly Etiqueta[];
  /** La API dijo que la etiqueta ya no existe: hay que volver a pedir el catálogo. */
  alNoExistir?: () => void;
}

export interface AvisoDeConversacion extends AvisoDeEtiqueta {
  /** Qué se intentaba, para el botón «Reintentar». */
  intento: { etiqueta: EtiquetaDeConversacion; poner: boolean } | null;
}

export interface ResultadoEtiquetasDeConversacion {
  /** Alterna la etiqueta: la pone si no está, la quita si está. */
  alternar: (etiqueta: Etiqueta | EtiquetaDeConversacion) => void;
  /** Ids con una petición en vuelo (la fila se marca ocupada; no se aceptan dos toques seguidos). */
  pendientes: ReadonlySet<string>;
  aviso: AvisoDeConversacion | null;
  descartarAviso: () => void;
  reintentar: () => void;
}

export function useEtiquetasDeConversacion(
  opciones: OpcionesEtiquetasDeConversacion,
): ResultadoEtiquetasDeConversacion {
  const [pendientes, setPendientes] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<AvisoDeConversacion | null>(null);

  // Siempre lo último, sin que `alternar` cambie de identidad en cada render.
  const ref = useRef(opciones);
  ref.current = opciones;
  const enVuelo = useRef(new Set<string>());

  // Cambiar de conversación borra el aviso del chat anterior.
  useEffect(() => {
    setAviso(null);
    setPendientes(new Set());
    enVuelo.current = new Set();
  }, [opciones.conversacionId]);

  const aplicar = useCallback((conversacionId: string, lista: EtiquetaDeConversacion[]) => {
    publicarEtiquetasDeConversacion(conversacionId, lista);
    // Solo se toca el estado del chat si sigue siendo ESE chat.
    if (ref.current.conversacionId === conversacionId) ref.current.alCambiar(lista);
  }, []);

  const ejecutar = useCallback(
    async (etiquetaEntrada: Etiqueta | EtiquetaDeConversacion, poner: boolean) => {
      const conversacionId = ref.current.conversacionId;
      const etiqueta = aEtiquetaDeConversacion(etiquetaEntrada);
      if (enVuelo.current.has(etiqueta.id)) return;

      const antes = ref.current.etiquetas;
      const indiceAntes = antes.findIndex((e) => e.id === etiqueta.id);
      if (poner && !antes.some((e) => e.id === etiqueta.id)) {
        if (antes.length >= MAX_ETIQUETAS_POR_CONVERSACION) {
          setAviso({
            ...interpretarErrorDeEtiqueta(
              { code: 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION' },
              'poner',
              etiqueta.nombre,
            ),
            intento: null,
          });
          return;
        }
      }

      setAviso(null);
      enVuelo.current.add(etiqueta.id);
      setPendientes(new Set(enVuelo.current));
      // Optimista: se ve antes de que el servidor conteste.
      aplicar(conversacionId, conEtiqueta(antes, etiqueta, poner, ref.current.catalogo));

      try {
        const resumen = poner
          ? await etiquetasApi.ponerEnConversacion(conversacionId, etiqueta.id)
          : await etiquetasApi.quitarDeConversacion(conversacionId, etiquetaEntrada.id);
        enVuelo.current.delete(etiqueta.id);
        setPendientes(new Set(enVuelo.current));
        // Con otra petición aún en vuelo no se pisa lo optimista con una foto vieja del servidor.
        if (enVuelo.current.size === 0) {
          aplicar(conversacionId, ordenarSegunCatalogo(resumen.etiquetas, ref.current.catalogo));
        }
      } catch (err) {
        enVuelo.current.delete(etiqueta.id);
        setPendientes(new Set(enVuelo.current));
        // Vuelve a su estado anterior, parta de lo que hay ahora (otra etiqueta pudo cambiar).
        const ahora = ref.current.conversacionId === conversacionId ? ref.current.etiquetas : antes;
        aplicar(
          conversacionId,
          poner
            ? conEtiqueta(ahora, etiqueta, false, ref.current.catalogo)
            : reponerEtiqueta(ahora, etiqueta, indiceAntes, ref.current.catalogo),
        );
        if (ref.current.conversacionId !== conversacionId) return;
        const interpretado = interpretarErrorDeEtiqueta(
          err,
          poner ? 'poner' : 'quitar',
          etiqueta.nombre,
        );
        setAviso({
          ...interpretado,
          intento: interpretado.siguiente === 'reintentar' ? { etiqueta, poner } : null,
        });
        if (interpretado.siguiente === 'recargar') ref.current.alNoExistir?.();
      }
    },
    [aplicar],
  );

  const alternar = useCallback(
    (etiqueta: Etiqueta | EtiquetaDeConversacion) => {
      const puesta = ref.current.etiquetas.some((e) => e.id === etiqueta.id);
      void ejecutar(etiqueta, !puesta);
    },
    [ejecutar],
  );

  const reintentar = useCallback(() => {
    const intento = aviso?.intento;
    if (!intento) return;
    setAviso(null);
    void ejecutar(intento.etiqueta, intento.poner);
  }, [aviso, ejecutar]);

  const descartarAviso = useCallback(() => setAviso(null), []);

  return { alternar, pendientes, aviso, descartarAviso, reintentar };
}
