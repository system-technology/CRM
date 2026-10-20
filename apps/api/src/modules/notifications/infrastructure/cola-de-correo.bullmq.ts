/**
 * La cola `correo-saliente` en BullMQ: el productor (la API). R5.
 *
 * El trabajo lleva el mensaje entero porque un token de invitación o un código de un solo uso
 * NO se pueden reconstruir (en la base solo está su hash). Eso pondría un secreto en Redis, que no
 * tiene RLS ni cifrado, así que: **el mensaje viaja CIFRADO** (AES-256-GCM, `CORREO_PAYLOAD_KEY`
 * compartida con el trabajador), el trabajo se borra al completarse Y al fallar del todo
 * (`removeOnComplete`, `removeOnFail`), y nada de esto se escribe en el registro.
 */
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';
import {
  type MensajeDeCorreo,
  PuertoColaDeCorreo,
} from '../../../shared/puertos/puerto-de-correo.js';
import { sellarCorreo, type TrabajoSellado } from '../domain/sellado-de-correo.js';

/**
 * Conexión de ioredis construida aquí y no por BullMQ (en ESM exige el cliente ya construido).
 * Se repite en vez de importarla de `inbox`: los módulos no se importan entre sí (R4).
 */
export function crearConexionDeRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export const NOMBRE_DE_COLA_DE_CORREO = 'correo-saliente';

export const TrabajoDeCorreo = z.object({
  para: z.string().email(),
  asunto: z.string().min(1).max(300),
  texto: z.string().min(1).max(10_000),
});

export const OPCIONES_DE_TRABAJO_DE_CORREO = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  // Borrar también los fallidos: aunque va cifrado, no hay motivo para que un trabajo con un
  // secreto se quede en Redis. El motivo del fallo se registra (sin contenido) al fallar.
  removeOnFail: true,
};

@Injectable()
export class ColaDeCorreoBullmq extends PuertoColaDeCorreo {
  private readonly conexion: Redis;
  private readonly cola: Queue<TrabajoSellado>;

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con la URL de Redis y la clave. */
  constructor(
    urlDeRedis: string,
    private readonly clave: Buffer,
    nombreDeCola: string = NOMBRE_DE_COLA_DE_CORREO,
  ) {
    super();
    this.conexion = crearConexionDeRedis(urlDeRedis);
    this.cola = new Queue<TrabajoSellado>(nombreDeCola, { connection: this.conexion });
  }

  async encolar(mensaje: MensajeDeCorreo, claveDeIdempotencia: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]+$/.test(claveDeIdempotencia)) {
      throw new Error('La clave de idempotencia solo admite [A-Za-z0-9_-].');
    }
    // Un trabajo con el mismo identificador se ignora: pedir dos veces lo mismo no envía dos.
    await this.cola.add('enviar-correo', sellarCorreo(mensaje, this.clave, claveDeIdempotencia), {
      ...OPCIONES_DE_TRABAJO_DE_CORREO,
      jobId: claveDeIdempotencia,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola.close();
    await this.conexion.quit();
  }
}
