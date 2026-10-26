/**
 * La cola `inbox-envios` (productor) y la reserva de envío, las dos en Redis. ADR-0018 §2.
 *
 * **El trabajo transporta únicamente `{ tenantId, mensajeId }`.** Ni el texto, ni el teléfono, ni
 * el token: Redis no tiene RLS ni cifrado, y un panel de colas lo mostraría en claro.
 *
 * **`jobId = envio-<mensajeId>`.** El relay del outbox entrega «al menos una vez» y puede encolar
 * el mismo mensaje dos veces; BullMQ ignora el segundo `add` mientras el primero exista. Cuando el
 * trabajo ya se limpió (1 h después de completar), un reencolado tardío llega al caso de uso, que
 * ve el `wamid` guardado y no hace nada. La idempotencia no descansa en una sola capa.
 *
 * **La reserva** (`SET NX` con caducidad de 7 días) es la marca de «esta petición pudo salir hacia
 * Meta». Vive en Redis y no en `mensajes` porque el esquema no tiene columna para ella; la columna
 * propuesta está en la cola de `datos` (ADR-0018, «El esquema»). Mientras tanto, vale lo mismo que vale la
 * cola: si Redis pierde datos, se pierden también los trabajos.
 */
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { PuertoColaDeEnvios, PuertoReservaDeEnvio } from '../application/puertos-de-envio.js';
import { crearConexionDeRedis } from './cola-de-changes.bullmq.js';

export const NOMBRE_DE_COLA_DE_ENVIOS = 'inbox-envios';

export interface DatosDelEnvio {
  tenantId: string;
  mensajeId: string;
}

export function idDeEnvio(mensajeId: string): string {
  return `envio-${mensajeId}`;
}

/**
 * Seis intentos con espera exponencial desde 3 s (3, 6, 12, 24, 48 s): unos 90 s en total. Una
 * respuesta de chat que sale media hora tarde ya no es una respuesta; mejor `FALLIDO` explicado
 * para que el asesor decida. Los reintentos cortos (segundos) los hace antes el adaptador.
 */
export const OPCIONES_DE_ENVIO = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600, count: 5_000 },
};

const CADUCIDAD_DE_RESERVA_S = 7 * 24 * 3_600;
const claveDeReserva = (mensajeId: string): string => `viajapro:envio-reservado:${mensajeId}`;

export class ColaDeEnviosBullmq extends PuertoColaDeEnvios {
  private readonly conexion: Redis;
  private readonly cola: Queue<DatosDelEnvio>;

  /** `@inyeccion-manual`: lo construye `InboxWorkerModule` con `REDIS_URL`. */
  constructor(urlDeRedis: string) {
    super();
    this.conexion = crearConexionDeRedis(urlDeRedis);
    this.cola = new Queue<DatosDelEnvio>(NOMBRE_DE_COLA_DE_ENVIOS, { connection: this.conexion });
  }

  async encolar(tenantId: string, mensajeId: string): Promise<void> {
    await this.cola.add(
      'enviar-mensaje',
      { tenantId, mensajeId },
      { ...OPCIONES_DE_ENVIO, jobId: idDeEnvio(mensajeId) },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola.close();
    await this.conexion.quit();
  }
}

export class ReservaDeEnvioRedis extends PuertoReservaDeEnvio {
  private readonly redis: Redis;

  /** `@inyeccion-manual`. */
  constructor(urlDeRedis: string) {
    super();
    this.redis = crearConexionDeRedis(urlDeRedis);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async reservar(mensajeId: string): Promise<boolean> {
    const r = await this.redis.set(
      claveDeReserva(mensajeId),
      '1',
      'EX',
      CADUCIDAD_DE_RESERVA_S,
      'NX',
    );
    return r === 'OK';
  }

  async liberar(mensajeId: string): Promise<void> {
    await this.redis.del(claveDeReserva(mensajeId));
  }
}

/** `REDIS_URL` o un arranque ruidoso: sin Redis no hay ni cola ni reserva. */
export function urlDeRedisParaEnvios(): string {
  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('Falta REDIS_URL: el envío de WhatsApp no tiene cola.');
  return url;
}
