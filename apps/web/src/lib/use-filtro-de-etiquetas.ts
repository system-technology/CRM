'use client';

/**
 * El filtro de la bandeja por etiqueta, con su estado en la URL (T-326, HU-inbox-1 §4.3):
 * `?etiquetas=<uuid,uuid>&modo=cualquiera|todas`. La URL es entrada del usuario: cada id pasa por la
 * validación de `parametros-url` (UUID) antes de llegar a la consulta.
 *
 * - `push` al empezar a filtrar (Atrás vuelve a la bandeja sin filtro) y `replace` al ajustar un
 *   filtro que ya existe: no se llena el historial con cada casilla.
 * - Una etiqueta del filtro que ya no está en el catálogo (otra persona la borró) sale del filtro
 *   con un aviso, en vez de dejar una lista vacía sin explicación.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Etiqueta, ModoDeFiltroDeEtiquetas } from '@viajapro/contracts';
import {
  consultaConFiltroDeEtiquetas,
  hrefConFiltro,
  leerFiltroDeEtiquetasDeUrl,
  modoDeNavegacionDelFiltro,
} from './etiquetas-logica';
import type { CatalogoDeEtiquetas } from './use-catalogo-de-etiquetas';

export interface FiltroDeEtiquetas {
  ids: string[];
  modo: ModoDeFiltroDeEtiquetas;
  /** Las etiquetas del filtro que el catálogo conoce, en el orden del catálogo. */
  seleccionadas: Etiqueta[];
  cambiar: (ids: string[], modo?: ModoDeFiltroDeEtiquetas) => void;
  /** Marca o desmarca una etiqueta partiendo de lo último que se pidió (no de una URL vieja). */
  alternar: (id: string) => void;
  quitar: (id: string) => void;
  cambiarModo: (modo: ModoDeFiltroDeEtiquetas) => void;
  limpiar: () => void;
  /** «La etiqueta “X” ya no existe». `null` si no hay nada que avisar. */
  aviso: string | null;
  descartarAviso: () => void;
}

export function useFiltroDeEtiquetas(catalogo: CatalogoDeEtiquetas): FiltroDeEtiquetas {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const lector = parametros ?? new URLSearchParams();
  const textoDeParametros = lector.toString();

  const leido = useMemo(
    () => leerFiltroDeEtiquetasDeUrl(new URLSearchParams(textoDeParametros)),
    [textoDeParametros],
  );
  const { modo, hayBasura } = leido;
  // El arreglo cambia de identidad solo si cambian los ids: otro parámetro de la URL (`?demo=1`) no
  // debe volver a pedir la bandeja.
  const claveDeIds = leido.ids.join(',');
  const ids = useMemo(() => (claveDeIds ? claveDeIds.split(',') : []), [claveDeIds]);

  const [aviso, setAviso] = useState<string | null>(null);
  /** Nombres vistos en cargas anteriores del catálogo: lo único que sobrevive a que la borren. */
  const nombresVistos = useRef(new Map<string, string>());
  for (const e of catalogo.etiquetas) nombresVistos.current.set(e.id, e.nombre);

  /**
   * Lo último que se pidió y la URL aún no refleja: dos toques seguidos (antes de que la navegación
   * del primero termine) parten del primero, no de una URL vieja, y no se pierde ninguna casilla.
   */
  const pendiente = useRef<{
    ids: string[];
    modo: ModoDeFiltroDeEtiquetas;
    texto: string;
    hasta: number;
  } | null>(null);
  useEffect(() => {
    if (pendiente.current && textoDeParametros === pendiente.current.texto)
      pendiente.current = null;
  }, [textoDeParametros]);
  const vigente = () => {
    const p = pendiente.current;
    if (p && Date.now() > p.hasta) pendiente.current = null;
    return pendiente.current;
  };

  const ir = useCallback(
    (idsNuevos: string[], modoNuevo: ModoDeFiltroDeEtiquetas, como: 'push' | 'replace') => {
      const base = vigente()?.texto ?? textoDeParametros;
      const consulta = consultaConFiltroDeEtiquetas(
        new URLSearchParams(base),
        idsNuevos,
        modoNuevo,
      );
      pendiente.current = {
        ids: idsNuevos,
        modo: modoNuevo,
        texto: consulta,
        hasta: Date.now() + 1500,
      };
      router[como](hrefConFiltro(pathname ?? '/bandeja', consulta), { scroll: false });
    },
    [pathname, router, textoDeParametros],
  );

  const cambiar = useCallback(
    (idsNuevos: string[], modoNuevo?: ModoDeFiltroDeEtiquetas) => {
      const previo = vigente();
      ir(
        idsNuevos,
        modoNuevo ?? previo?.modo ?? modo,
        modoDeNavegacionDelFiltro(previo?.ids ?? ids, idsNuevos),
      );
    },
    [ids, ir, modo],
  );

  const alternar = useCallback(
    (id: string) => {
      const base = vigente()?.ids ?? ids;
      cambiar(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
    },
    [cambiar, ids],
  );
  const quitar = useCallback(
    (id: string) => cambiar((vigente()?.ids ?? ids).filter((x) => x !== id)),
    [cambiar, ids],
  );
  const cambiarModo = useCallback(
    (nuevo: ModoDeFiltroDeEtiquetas) => cambiar(vigente()?.ids ?? ids, nuevo),
    [cambiar, ids],
  );

  const limpiar = useCallback(() => ir([], 'cualquiera', 'replace'), [ir]);

  // Basura en la URL (id mal formado, repetido, de más o modo desconocido): se deja solo lo válido.
  useEffect(() => {
    if (hayBasura) ir(ids, modo, 'replace');
    // `ids` entra por su clave: un arreglo nuevo con el mismo contenido no debe repetir el efecto.
  }, [hayBasura, claveDeIds, modo]);

  // Etiquetas del filtro que el catálogo ya no tiene: salen del filtro y se avisa.
  useEffect(() => {
    if (catalogo.estado !== 'listo' || catalogo.recargando || ids.length === 0) return;
    const existentes = new Set(catalogo.etiquetas.map((e) => e.id));
    const borradas = ids.filter((id) => !existentes.has(id));
    if (borradas.length === 0) return;
    const nombres = borradas
      .map((id) => nombresVistos.current.get(id))
      .filter((n): n is string => typeof n === 'string');
    setAviso(
      nombres.length === borradas.length && nombres.length === 1
        ? `La etiqueta “${nombres[0] ?? ''}” ya no existe. Se quitó del filtro.`
        : borradas.length === 1
          ? 'Una etiqueta del filtro ya no existe. Se quitó del filtro.'
          : `${borradas.length} etiquetas del filtro ya no existen. Se quitaron del filtro.`,
    );
    ir(
      ids.filter((id) => existentes.has(id)),
      modo,
      'replace',
    );
  }, [catalogo.estado, catalogo.recargando, catalogo.etiquetas, claveDeIds]);

  const seleccionadas = useMemo(
    () => catalogo.etiquetas.filter((e) => ids.includes(e.id)),
    [catalogo.etiquetas, ids],
  );

  const descartarAviso = useCallback(() => setAviso(null), []);

  return {
    ids,
    modo,
    seleccionadas,
    cambiar,
    alternar,
    quitar,
    cambiarModo,
    limpiar,
    aviso,
    descartarAviso,
  };
}
