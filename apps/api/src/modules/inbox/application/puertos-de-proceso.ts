/**
 * Los puertos del trabajador. Clases abstractas por el mismo motivo que `PuertoRecepciones`:
 * Nest necesita un símbolo en ejecución para inyectar.
 */
import type { MensajeEntrante } from '../domain/contenido-del-cambio.js';

export type EstadoDelChange = 'PENDIENTE' | 'PROCESADO' | 'CLASIFICADO';
export type EstadoDeEnrutamiento = 'ACTIVO' | 'SUSPENDIDO' | 'REVOCADO';

export interface ChangeTomado {
  /** `null` cuando el contenido ya se anuló: el change está resuelto y no hay nada que leer. */
  cifrado: Buffer | null;
  nonce: Buffer | null;
  tag: Buffer | null;
  claveVersion: number;
  estado: EstadoDelChange;
}

export interface EnrutamientoResuelto {
  tenantId: string;
  canalId: string | null;
  estado: EstadoDeEnrutamiento;
}

/** El staging y el directorio: lo único que el rol `viajapro_webhook` puede tocar sin tenant. */
export abstract class PuertoStaging {
  /** Un change por su identificador exacto. `null` si no existe. */
  abstract tomar(recepcionId: Buffer, indice: number): Promise<ChangeTomado | null>;
  /** `null` si la clave no está en el directorio. */
  abstract resolver(clave: Buffer): Promise<EnrutamientoResuelto | null>;
  /** Marca el change y anula el contenido cuando ya no queda ninguno pendiente. */
  abstract cerrar(
    recepcionId: Buffer,
    indice: number,
    estado: 'PROCESADO' | 'CLASIFICADO',
  ): Promise<void>;
}

export type ResultadoDeBandeja = 'CREADO' | 'DUPLICADO' | 'CANAL_REVOCADO';

/** La escritura de negocio, siempre bajo el tenant resuelto y por tanto bajo RLS. */
export abstract class PuertoBandeja {
  abstract registrarEntrante(
    tenantId: string,
    canalId: string,
    mensaje: MensajeEntrante,
  ): Promise<ResultadoDeBandeja>;
}

/** La cola de trabajos. Transporta únicamente identificadores: el contenido nunca sale de la base. */
export abstract class PuertoColaDeChanges {
  abstract encolar(recepcionId: Buffer, indice: number): Promise<void>;
}
