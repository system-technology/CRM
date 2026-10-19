/**
 * La cola `inbox-changes` en BullMQ: el productor (la API) y el identificador de trabajo.
 *
 * **El trabajo transporta únicamente `recepcionId` (hex) e `indice`.** El contenido nunca sale de
 * PostgreSQL: Redis no tiene RLS ni cifrado, y un panel de colas lo mostraría en claro. ADR-0008 §4.
 *
 * **`jobId = <recepcion_id hex>-<índice>`**, uno por `change`. El ADR escribe `:` como separador;
 * BullMQ rechaza `:` en un identificador propio (es su separador de claves en Redis), así que
 * se usa `-`. La convención del índice —orden aplanado sobre `entry[].changes[]`— es la del ADR.
 */
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PuertoColaDeChanges } from '../application/puertos-de-proceso.js';

export const NOMBRE_DE_COLA = 'inbox-changes';

export interface DatosDelTrabajo {
  recepcionId: string;
  indice: number;
}

export function idDeTrabajo(recepcionId: Buffer, indice: number): string {
  return `${recepcionId.toString('hex')}-${indice}`;
}

/**
 * Conexión de ioredis, construida aquí y no por BullMQ: BullMQ 6 carga ioredis de forma opcional
 * y en ESM exige que se le pase el cliente ya construido. `maxRetriesPerRequest: null` es
 * obligatorio para un `Worker`, e inocuo para una `Queue`.
 */
export function crearConexionDeRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/** Misma política de limpieza en productor y consumidor: sin contenido, pero sin acumular. */
export const OPCIONES_DE_TRABAJO = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
};

@Injectable()
export class ColaDeChangesBullmq extends PuertoColaDeChanges {
  private readonly conexion: Redis;
  private readonly cola: Queue<DatosDelTrabajo>;

  constructor(urlDeRedis: string) {
    super();
    this.conexion = crearConexionDeRedis(urlDeRedis);
    this.cola = new Queue<DatosDelTrabajo>(NOMBRE_DE_COLA, { connection: this.conexion });
  }

  async encolar(recepcionId: Buffer, indice: number): Promise<void> {
    // Si ya existe un trabajo con ese identificador, BullMQ lo ignora: el reintento de Meta no
    // duplica trabajo.
    await this.cola.add(
      'procesar-change',
      { recepcionId: recepcionId.toString('hex'), indice },
      { ...OPCIONES_DE_TRABAJO, jobId: idDeTrabajo(recepcionId, indice) },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola.close();
    await this.conexion.quit();
  }
}
