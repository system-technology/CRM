/**
 * El consumidor de la cola `inbox-changes`: recoge el trabajo y llama al caso de uso.
 *
 * Es solo pegamento. Lee `{ recepcionId, indice }` —nunca contenido— y delega en
 * `ProcesarChange`. Si el caso de uso lanza, BullMQ reintenta con retroceso exponencial; el
 * change sigue `PENDIENTE` en la base, que es lo durable, y el caso de uso es idempotente.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { ProcesarChange } from '../application/procesar-change.js';
import {
  crearConexionDeRedis,
  type DatosDelTrabajo,
  NOMBRE_DE_COLA,
} from '../infrastructure/cola-de-changes.bullmq.js';

/** Datos de un trabajo, validados: viene de Redis, que no es de fiar. */
export function leerTrabajo(datos: unknown): { recepcionId: Buffer; indice: number } {
  const d = datos as Partial<DatosDelTrabajo> | null;
  if (
    !d ||
    typeof d.recepcionId !== 'string' ||
    !/^[0-9a-f]{64}$/.test(d.recepcionId) ||
    typeof d.indice !== 'number' ||
    !Number.isInteger(d.indice) ||
    d.indice < 0
  ) {
    throw new Error('Trabajo de inbox-changes malformado.');
  }
  return { recepcionId: Buffer.from(d.recepcionId, 'hex'), indice: d.indice };
}

@Injectable()
export class ConsumidorDeChanges implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ConsumidorDeChanges.name);
  private worker: Worker<DatosDelTrabajo> | null = null;
  private conexion: Redis | null = null;

  constructor(@Inject(ProcesarChange) private readonly procesar: ProcesarChange) {}

  onModuleInit(): void {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('Falta REDIS_URL: el trabajador no tiene de dónde recoger.');

    this.conexion = crearConexionDeRedis(url);
    this.worker = new Worker<DatosDelTrabajo>(
      NOMBRE_DE_COLA,
      async (trabajo) => {
        const { recepcionId, indice } = leerTrabajo(trabajo.data);
        const r = await this.procesar.ejecutar(recepcionId, indice);
        return r.estado;
      },
      { connection: this.conexion, concurrency: 5 },
    );
    this.worker.on('failed', (trabajo, error) => {
      // El mensaje del error y el id del trabajo; nunca `trabajo.data` completo ni contenido.
      this.log.error(
        `Trabajo ${trabajo?.id ?? '?'} falló (intento ${trabajo?.attemptsMade ?? 0}): ${error.message}`,
      );
    });
    this.log.log(`Consumiendo la cola ${NOMBRE_DE_COLA}.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.conexion?.quit();
  }
}
