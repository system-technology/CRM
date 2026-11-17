'use client';

/**
 * Estado de la campana para los avisos de plazo (T-255): carga al montar, refresca cada
 * `INTERVALO_REFRESCO_AVISOS_MS` solo con la pestaña visible, y al abrir el desplegable solo si el
 * dato tiene más de `VIGENCIA_AVISOS_MS` (no martillea la API). Marcar leída es optimista: si el
 * servidor falla, se vuelve a pedir la lista y el aviso reaparece como no leído.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListaDeNotificaciones } from '@viajapro/contracts';
import { listarAvisos, marcarAvisoLeido } from './avisos-plazo-api';
import { INTERVALO_REFRESCO_AVISOS_MS, VIGENCIA_AVISOS_MS } from './avisos-plazo-logica';

export type EstadoAvisos =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; lista: ListaDeNotificaciones };

export function aplicarLecturaLocal(
  lista: ListaDeNotificaciones,
  id: string,
  ahoraIso: string,
): ListaDeNotificaciones {
  const objetivo = lista.datos.find((n) => n.id === id);
  if (!objetivo || objetivo.leidaEn !== null) return lista;
  return {
    datos: lista.datos.map((n) => (n.id === id ? { ...n, leidaEn: ahoraIso } : n)),
    noLeidas: Math.max(0, lista.noLeidas - 1),
  };
}

/** `esDemo` cambia la fuente de datos (ejemplo o API): al cambiar se vuelve a pedir. */
export function useAvisosDePlazo(esDemo = false) {
  const [estado, setEstado] = useState<EstadoAvisos>({ tipo: 'cargando' });
  const ultimaCargaMs = useRef(0);
  const enVuelo = useRef(false);

  const refrescar = useCallback(async (opciones: { silencioso?: boolean } = {}) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    // Con datos ya en pantalla no se parpadea a «cargando»; el error visible solo si no hay nada.
    if (!opciones.silencioso) {
      setEstado((e) => (e.tipo === 'listo' ? e : { tipo: 'cargando' }));
    }
    try {
      const lista = await listarAvisos();
      ultimaCargaMs.current = Date.now();
      setEstado({ tipo: 'listo', lista });
    } catch {
      setEstado((e) =>
        e.tipo === 'listo'
          ? e
          : {
              tipo: 'error',
              mensaje: 'No pudimos cargar los avisos de plazo. Revisa tu conexión y reintenta.',
            },
      );
    } finally {
      enVuelo.current = false;
    }
  }, []);

  useEffect(() => {
    void refrescar();
    const reloj = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refrescar({ silencioso: true });
      }
    }, INTERVALO_REFRESCO_AVISOS_MS);
    return () => clearInterval(reloj);
  }, [refrescar, esDemo]);

  /** Para el momento de abrir el desplegable. */
  const refrescarSiEstaViejo = useCallback(() => {
    if (Date.now() - ultimaCargaMs.current >= VIGENCIA_AVISOS_MS) {
      void refrescar({ silencioso: true });
    }
  }, [refrescar]);

  const marcarLeido = useCallback(
    (id: string) => {
      setEstado((e) =>
        e.tipo === 'listo'
          ? { tipo: 'listo', lista: aplicarLecturaLocal(e.lista, id, new Date().toISOString()) }
          : e,
      );
      void marcarAvisoLeido(id).catch(() => {
        // El servidor no la registró: la verdad es la del servidor.
        void refrescar({ silencioso: true });
      });
    },
    [refrescar],
  );

  return { estado, refrescar, refrescarSiEstaViejo, marcarLeido };
}
