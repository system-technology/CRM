import { Redis } from 'ioredis';
import { LimitadorDeEnvios } from '../application/limitador-de-envios.js';

/** Lo mínimo de ioredis que se usa; permite probar con un doble. */
export interface ClienteRedisDeContadores {
  multi(): {
    incr(clave: string): unknown;
    expire(clave: string, segundos: number, modo: 'NX'): unknown;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
  };
}

/**
 * Contador en Redis: `INCR` + `EXPIRE NX` en una transacción, así la clave nunca queda sin TTL
 * (Redis >= 7). Un fallo de Redis se propaga: no se concede ni se niega en silencio.
 */
export class LimitadorDeEnviosRedis extends LimitadorDeEnvios {
  constructor(private readonly redis: ClienteRedisDeContadores) {
    super();
  }

  static desdeUrl(url: string): LimitadorDeEnviosRedis {
    return new LimitadorDeEnviosRedis(new Redis(url));
  }

  async consumir(clave: string, maximo: number, ventanaSegundos: number): Promise<boolean> {
    const m = this.redis.multi();
    m.incr(clave);
    m.expire(clave, ventanaSegundos, 'NX');
    const resultado = await m.exec();
    const [error, cuenta] = resultado?.[0] ?? [new Error('Redis no devolvió el contador.'), 0];
    if (error) throw error;
    return typeof cuenta === 'number' && cuenta <= maximo;
  }
}
