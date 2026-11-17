/**
 * Los puertos de salida de la operación del archivo de viaje (T-242). Clases abstractas y no
 * interfaces: Nest necesita un símbolo en ejecución para inyectarlas.
 *
 * Todo corre bajo el tenant de la petición (`ContextoTenant` → `app.current_tenant` → RLS): ningún
 * método recibe un `tenantId` que alguien pueda pasar mal. Una fila de otra agencia no se ve, y el
 * puerto responde `null` igual que si no existiera.
 */
import type { Archivo, CancelacionDelArchivo, PasajeroNuevo } from '../domain/archivo.js';
import type { Reserva } from '../domain/reserva.js';

/** Lo que se puede hacer dentro de UNA transacción, con el archivo bloqueado. */
export interface OperacionesDelArchivo {
  /**
   * Bloquea la fila del archivo (`FOR UPDATE`) y lo lee con sus reservas y pasajeros. Siempre se
   * bloquea primero el archivo: serializa las operaciones sobre él y evita interbloqueos entre
   * «operar una reserva» y «cancelar el archivo».
   */
  leerBloqueado(archivoId: string): Promise<Archivo | null>;
  /** Zona IANA de la agencia (R9: solo para comparar un plazo con la fecha de salida). */
  zonaHoraria(): Promise<string>;
  /** Escribe la reserva. El filtro es `id AND travel_file_id` además de RLS. */
  guardarReserva(archivoId: string, reserva: Reserva, actorId: string | null): Promise<void>;
  /** Reemplaza la lista completa: borra y vuelve a crear, en el orden recibido. */
  reemplazarPasajeros(
    archivoId: string,
    pasajeros: readonly PasajeroNuevo[],
    actorId: string | null,
  ): Promise<void>;
  /** Marca el archivo CANCELADO y cancela con él sus reservas vivas. */
  guardarCancelacion(archivoId: string, cancelacion: CancelacionDelArchivo): Promise<void>;
}

export interface FiltroDeArchivos {
  estado: 'ABIERTO' | 'CANCELADO' | 'TODOS';
  limite: number;
}

export abstract class RepositorioDeOperacionDeArchivos {
  /** Archivos con sus reservas, SIN pasajeros (la lista no los necesita). */
  abstract listar(filtro: FiltroDeArchivos): Promise<Archivo[]>;
  /** Un archivo con reservas y pasajeros; `null` si no existe en esta agencia. */
  abstract leer(archivoId: string): Promise<Archivo | null>;
  abstract enTransaccion<T>(fn: (ops: OperacionesDelArchivo) => Promise<T>): Promise<T>;
}
