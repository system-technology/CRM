/**
 * Puertos de la gestión por id (ADR-0017 §4.1): lo que las altas por clave natural del planificador
 * no cubren. Mismo trato que `puertos-de-catalogo.ts`: viven dentro de la misma transacción, con el
 * tenant fijado, y la auditoría se escribe con el mismo `tx`.
 */

import type { EspacioDeTrabajo } from './puertos-de-catalogo.js';

export interface VentanaDeVigencia {
  readonly desde: string;
  readonly hasta: string;
  readonly publicada: boolean;
  readonly cupoTotal: number | null;
}

export abstract class OperacionesPorId {
  /** Nombre del mayorista de ESTA agencia (RLS), o `null` si no existe o fue dado de baja. */
  abstract nombreDeMayorista(id: string): Promise<string | null>;

  /** Cambia la ventana, la publicación o el cupo de la vigencia con ese id. */
  abstract actualizarVigencia(id: string, ventana: VentanaDeVigencia): Promise<void>;

  /** Borra la tarifa. Las cotizaciones guardadas copian el precio, no referencian la fila. */
  abstract eliminarTarifa(id: string): Promise<void>;
}

export interface EspacioDeGestion extends EspacioDeTrabajo {
  readonly porId: OperacionesPorId;
}

export abstract class UnidadDeTrabajoDeGestion {
  /** Una transacción con el tenant fijado. Si `fn` lanza, no queda nada, ni la auditoría. */
  abstract ejecutar<T>(fn: (espacio: EspacioDeGestion) => Promise<T>): Promise<T>;
}
