/**
 * Índices «contacto → su viaje» para pintar la línea de viaje en la bandeja sin una petición por
 * fila (sin N+1): se pide UNA vez el tablero del pipeline y UNA vez la lista de archivos, y la fila
 * busca por `contactoId`. Es lo que la web ya pide a `crm` y a `reservas`; no hay API nueva.
 */
import type { ResumenDeArchivo, TableroPipeline, Oportunidad } from '@viajapro/contracts';
import {
  componerViaje,
  type ArchivoParaViaje,
  type OportunidadParaViaje,
  type ViajeDeContacto,
} from './viaje-solicitado-logica';

export interface IndiceDeViajes {
  oportunidades: Map<string, OportunidadParaViaje>;
  archivos: Map<string, ArchivoParaViaje>;
}

export const INDICE_VACIO: IndiceDeViajes = {
  oportunidades: new Map(),
  archivos: new Map(),
};

/** Por contacto, su oportunidad abierta más reciente (las ganadas y perdidas ya no piden nada). */
export function indexarOportunidades(tablero: TableroPipeline): Map<string, OportunidadParaViaje> {
  const mejor = new Map<string, Oportunidad>();
  for (const columna of tablero.columnas) {
    if (columna.etapa.esGanada || columna.etapa.esPerdida) continue;
    for (const o of columna.oportunidades) {
      const previa = mejor.get(o.contactoId);
      if (!previa || o.creadaEn > previa.creadaEn) mejor.set(o.contactoId, o);
    }
  }
  return new Map(
    [...mejor].map(([contactoId, o]) => [
      contactoId,
      { id: o.id, destino: o.destino, fechaSalida: o.fechaSalida, paqueteId: o.paqueteId },
    ]),
  );
}

/** Por contacto, su archivo abierto de salida más próxima. */
export function indexarArchivos(archivos: ResumenDeArchivo[]): Map<string, ArchivoParaViaje> {
  const mejor = new Map<string, ResumenDeArchivo>();
  for (const a of archivos) {
    if (a.estado !== 'ABIERTO') continue;
    const previo = mejor.get(a.contactoId);
    if (!previo || a.fechaSalida < previo.fechaSalida) mejor.set(a.contactoId, a);
  }
  return mejor;
}

/** El viaje de un contacto con lo que haya en el índice; `null` si no se sabe nada de él. */
export function viajeDeContacto(
  indice: IndiceDeViajes,
  contactoId: string,
  ahora: number = Date.now(),
): ViajeDeContacto | null {
  const oportunidad = indice.oportunidades.get(contactoId) ?? null;
  const archivo = indice.archivos.get(contactoId) ?? null;
  if (!oportunidad && !archivo) return null;
  return componerViaje({ oportunidad, archivo, ahora });
}
