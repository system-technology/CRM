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

/**
 * Un error sin su mensaje. **R10.** El mensaje de un error de Prisma o de PostgreSQL puede traer
 * la fila entera («Failing row contains (...)») con el teléfono y el texto del viajero, y
 * BullMQ guarda el failedReason siete días en Redis, que no tiene RLS ni cifrado. Solo
 * sobreviven la clase y el código, que son los que permiten diagnosticar.
 */
export class ErrorDeTrabajo extends Error {
  constructor(readonly codigo: string) {
    super(`Falló el procesamiento del change (${codigo}).`);
    this.name = 'ErrorDeTrabajo';
  }
}

export function sanearError(error: unknown): ErrorDeTrabajo {
  if (error instanceof ErrorDeTrabajo) return error;
  const e = error as { code?: unknown; constructor?: { name?: string } } | null;
  const clase = e?.constructor?.name ?? 'Error';
  const codigo = typeof e?.code === 'string' ? e.code : null;
  return new ErrorDeTrabajo(codigo ? `${clase}:${codigo}` : clase);
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
      (trabajo) => this.atender(trabajo.data),
      { connection: this.conexion, concurrency: 5 },
    );
    this.worker.on('failed', (trabajo, error) =>
      this.registrarFallo(trabajo?.id, trabajo?.attemptsMade ?? 0, error),
    );
    this.log.log(`Consumiendo la cola ${NOMBRE_DE_COLA}.`);
  }

  /** Un trabajo. Lo que lance sube saneado: es lo que BullMQ guarda como failedReason. */
  async atender(datos: unknown): Promise<string> {
    try {
      const { recepcionId, indice } = leerTrabajo(datos);
      const r = await this.procesar.ejecutar(recepcionId, indice);
      return r.estado;
    } catch (error) {
      throw sanearError(error);
    }
  }

  /** La clase y el código del error y el id del trabajo; nunca el mensaje ni los datos. */
  registrarFallo(id: string | undefined, intento: number, error: unknown): void {
    this.log.error(`Trabajo ${id ?? '?'} falló (intento ${intento}): ${sanearError(error).codigo}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.conexion?.quit();
  }
}
