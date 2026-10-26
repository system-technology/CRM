/**
 * El consumidor de la cola `inbox-envios`: recoge el trabajo y llama al caso de uso. ADR-0018.
 *
 * Solo pegamento. Lee `{ tenantId, mensajeId }` —nunca contenido—, valida que sean UUID (Redis no
 * es de fiar) y le dice al caso de uso si este es el último intento. Lo que lance sube saneado:
 * es lo que BullMQ guarda siete días como `failedReason`, y no puede llevar ni el token ni el
 * número del viajero.
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
import { z } from 'zod';
import { EnviarMensajeSaliente } from '../application/enviar-mensaje-saliente.js';
import { crearConexionDeRedis } from '../infrastructure/cola-de-changes.bullmq.js';
import {
  type DatosDelEnvio,
  NOMBRE_DE_COLA_DE_ENVIOS,
  OPCIONES_DE_ENVIO,
} from '../infrastructure/cola-de-envios.bullmq.js';
import { ErrorDeTrabajo, sanearError } from './consumidor-de-changes.js';

const TrabajoDeEnvio = z.object({ tenantId: z.string().uuid(), mensajeId: z.string().uuid() });

/** Datos de un trabajo, validados. */
export function leerTrabajoDeEnvio(datos: unknown): DatosDelEnvio {
  const r = TrabajoDeEnvio.safeParse(datos);
  if (!r.success) throw new ErrorDeTrabajo('TrabajoDeEnvioMalformado');
  return r.data;
}

/** `attemptsMade` cuenta los intentos YA hechos; el que corre ahora es el siguiente. */
export function esUltimoIntento(
  intentosHechos: number,
  intentosMaximos: number | undefined,
): boolean {
  return intentosHechos + 1 >= (intentosMaximos ?? OPCIONES_DE_ENVIO.attempts);
}

@Injectable()
export class ConsumidorDeEnvios implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ConsumidorDeEnvios.name);
  private worker: Worker<DatosDelEnvio> | null = null;
  private conexion: Redis | null = null;

  constructor(@Inject(EnviarMensajeSaliente) private readonly enviar: EnviarMensajeSaliente) {}

  onModuleInit(): void {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('Falta REDIS_URL: el trabajador no tiene de dónde recoger envíos.');
    this.conexion = crearConexionDeRedis(url);
    this.worker = new Worker<DatosDelEnvio>(
      NOMBRE_DE_COLA_DE_ENVIOS,
      (trabajo) => this.atender(trabajo.data, trabajo.attemptsMade, trabajo.opts.attempts),
      { connection: this.conexion, concurrency: 5 },
    );
    this.worker.on('failed', (trabajo, error) =>
      this.log.error(
        `Envío ${trabajo?.id ?? '?'} falló (intento ${trabajo?.attemptsMade ?? 0}): ${sanearError(error).codigo}`,
      ),
    );
    this.log.log(`Consumiendo la cola ${NOMBRE_DE_COLA_DE_ENVIOS}.`);
  }

  async atender(
    datos: unknown,
    intentosHechos: number,
    intentosMaximos: number | undefined,
  ): Promise<string> {
    try {
      const { tenantId, mensajeId } = leerTrabajoDeEnvio(datos);
      const r = await this.enviar.ejecutar(
        tenantId,
        mensajeId,
        esUltimoIntento(intentosHechos, intentosMaximos),
      );
      return r.estado;
    } catch (error) {
      throw sanearErrorDeEnvio(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.conexion?.quit();
  }
}

/** Un error de dominio conserva su código estable; cualquier otro, solo clase y código. */
export function sanearErrorDeEnvio(error: unknown): ErrorDeTrabajo {
  const codigo = (error as { code?: unknown } | null)?.code;
  if (typeof codigo === 'string' && codigo.startsWith('WHATSAPP_')) {
    return new ErrorDeTrabajo(codigo);
  }
  return sanearError(error);
}
