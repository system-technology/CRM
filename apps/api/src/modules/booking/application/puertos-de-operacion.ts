/**
 * Los puertos de salida de la operación del archivo de viaje (T-242). Clases abstractas y no
 * interfaces: Nest necesita un símbolo en ejecución para inyectarlas.
 *
 * Todo corre bajo el tenant de la petición (`ContextoTenant` → `app.current_tenant` → RLS): ningún
 * método recibe un `tenantId` que alguien pueda pasar mal. Una fila de otra agencia no se ve, y el
 * puerto responde `null` igual que si no existiera.
 */
import type { Archivo, CancelacionDelArchivo, PasajeroNuevo } from '../domain/archivo.js';
import type { CambioDeEstadoDeReserva, Reserva } from '../domain/reserva.js';

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
  /**
   * Escribe la reserva. El filtro es `id AND travel_file_id` además de RLS. `anterior` es la que se
   * leyó: las marcas `aviso_*` solo se escriben cuando el dominio las limpió (cambió un plazo); en
   * lo demás se omiten, para no pisar una marca que la vigilancia ganó entre la lectura y la escritura.
   */
  guardarReserva(
    archivoId: string,
    reserva: Reserva,
    actorId: string | null,
    anterior: Reserva,
  ): Promise<void>;
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

/**
 * Qué archivos entran, por la oportunidad de la que cuelgan (T-549). Es un filtro de `booking`
 * sobre SU propia columna `travel_files.oportunidad_id`: la lista de oportunidades la decide quien
 * llama, con lo que le respondieron los puertos de `crm` y de `identity`. Así «sin responsable» se
 * filtra ANTES del `LIMIT` sin que `booking` haga JOIN con tablas de otro contexto (R4).
 */
export interface RestriccionDeOportunidades {
  /** Entran los archivos cuya oportunidad esté aquí. Lista vacía: ninguno por esta vía. */
  oportunidades: readonly string[];
  /** Si además entran los archivos que no vienen de ninguna oportunidad. */
  incluirSinOportunidad: boolean;
}

export abstract class RepositorioDeOperacionDeArchivos {
  /**
   * Archivos con sus reservas, SIN pasajeros (la lista no los necesita). Vienen YA ordenados por el
   * plazo vigente más próximo (sin plazo, al final, por número) y el límite se aplica DESPUÉS de
   * ordenar (T-251) y DESPUÉS de `restriccion`, si viene (T-549).
   */
  abstract listar(
    filtro: FiltroDeArchivos,
    restriccion?: RestriccionDeOportunidades,
  ): Promise<Archivo[]>;
  /**
   * Los `oportunidad_id` distintos y no nulos de los archivos ABIERTOS de la agencia (T-549). Sin
   * límite y sin filas: son los ids que hay que preguntar fuera para saber qué está huérfano, y
   * preguntarlos sobre una ventana recortada era justo el defecto.
   */
  abstract oportunidadesDeArchivosAbiertos(): Promise<string[]>;
  /** Un archivo con reservas y pasajeros; `null` si no existe en esta agencia. */
  abstract leer(archivoId: string): Promise<Archivo | null>;
  /** Cambios de estado de las reservas del archivo, del más antiguo al más reciente (T-250). */
  abstract historialDe(archivoId: string): Promise<CambioDeEstadoDeReserva[]>;
  abstract enTransaccion<T>(fn: (ops: OperacionesDelArchivo) => Promise<T>): Promise<T>;
}
