'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { obtenerTableroPipeline } from './crm-api';
import { listarArchivos } from './archivos-api';
import {
  indexarArchivos,
  indexarOportunidades,
  INDICE_VACIO,
  type IndiceDeViajes,
} from './viajes-de-contactos-logica';

/**
 * El índice «contacto → viaje» de la bandeja y del pipeline. Lo carga la pantalla una sola vez (a
 * lo sumo dos peticiones, no una por fila) y lo leen las filas y tarjetas. Sin proveedor, el
 * índice es vacío y simplemente no se pinta la línea de viaje.
 */
const ViajesBandejaContext = createContext<IndiceDeViajes>(INDICE_VACIO);

export const ViajesBandejaProvider = ViajesBandejaContext.Provider;

export function useViajesBandeja(): IndiceDeViajes {
  return useContext(ViajesBandejaContext);
}

/**
 * Pide el tablero y los archivos en paralelo. Si una fuente falla (sin permiso, sin red) la otra
 * sigue valiendo, y lo que no se sabe no se pinta: el viaje es un complemento de la pantalla, no
 * una razón para que no cargue. El pipeline ya tiene su propio tablero y pide solo los archivos.
 */
export function useCargarIndiceDeViajes(
  fuentes: { oportunidades?: boolean; archivos?: boolean } = {},
): IndiceDeViajes {
  const { oportunidades: conOportunidades = true, archivos: conArchivos = true } = fuentes;
  const [indice, setIndice] = useState<IndiceDeViajes>(INDICE_VACIO);

  useEffect(() => {
    let vigente = true;
    void Promise.allSettled([
      conOportunidades ? obtenerTableroPipeline() : Promise.resolve(null),
      conArchivos ? listarArchivos('ABIERTO') : Promise.resolve(null),
    ]).then(([tablero, archivos]) => {
      if (!vigente) return;
      if (tablero.status === 'rejected') {
        console.warn('[viajes] Sin oportunidades para la línea de viaje:', tablero.reason);
      }
      if (archivos.status === 'rejected') {
        console.warn('[viajes] Sin archivos para la línea de viaje:', archivos.reason);
      }
      setIndice({
        oportunidades:
          tablero.status === 'fulfilled' && tablero.value
            ? indexarOportunidades(tablero.value)
            : INDICE_VACIO.oportunidades,
        archivos:
          archivos.status === 'fulfilled' && archivos.value
            ? indexarArchivos(archivos.value)
            : INDICE_VACIO.archivos,
      });
    });
    return () => {
      vigente = false;
    };
  }, [conOportunidades, conArchivos]);

  return indice;
}
