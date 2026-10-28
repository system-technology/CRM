import { Redis } from 'ioredis';

export interface LecturaDeContador {
  /** Peticiones contadas en la ventana vigente, incluida la actual. */
  readonly cuenta: number;
  /** Segundos que faltan para que la ventana se reinicie (siempre >= 1). */
  readonly segundosRestantes: number;
}

/** Puerto del contador. Ventana fija: la primera petición abre la ventana. */
export abstract class AlmacenDeContadores {
  abstract consumir(clave: string, ventanaSegundos: number): Promise<LecturaDeContador>;
}

/** Desarrollo y pruebas. No sirve con más de una réplica. */
export class AlmacenDeContadoresEnMemoria extends AlmacenDeContadores {
  private readonly cuentas = new Map<string, { n: number; vence: number }>();

  constructor(private readonly reloj: () => number = Date.now) {
    super();
  }

  consumir(clave: string, ventanaSegundos: number): Promise<LecturaDeContador> {
    const ahora = this.reloj();
    if (this.cuentas.size > 10_000) this.barrer(ahora);
    const actual = this.cuentas.get(clave);
    const cuenta =
      actual && actual.vence > ahora ? actual : { n: 0, vence: ahora + ventanaSegundos * 1000 };
    cuenta.n += 1;
    this.cuentas.set(clave, cuenta);
    return Promise.resolve({
      cuenta: cuenta.n,
      segundosRestantes: Math.max(1, Math.ceil((cuenta.vence - ahora) / 1000)),
    });
  }

  private barrer(ahora: number): void {
    for (const [clave, { vence }] of this.cuentas) if (vence <= ahora) this.cuentas.delete(clave);
  }
}

/** Lo mínimo de ioredis que se usa; permite probar con un doble. */
export interface ClienteRedisDeLimite {
  multi(): {
    incr(clave: string): unknown;
    expire(clave: string, segundos: number, modo: 'NX'): unknown;
    ttl(clave: string): unknown;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
  };
}

/** `INCR` + `EXPIRE NX` + `TTL` en una transacción: la clave nunca queda sin TTL (Redis >= 7). */
export class AlmacenDeContadoresRedis extends AlmacenDeContadores {
  constructor(private readonly redis: ClienteRedisDeLimite) {
    super();
  }

  static desdeUrl(url: string): AlmacenDeContadoresRedis {
    return new AlmacenDeContadoresRedis(new Redis(url));
  }

  async consumir(clave: string, ventanaSegundos: number): Promise<LecturaDeContador> {
    const m = this.redis.multi();
    m.incr(clave);
    m.expire(clave, ventanaSegundos, 'NX');
    m.ttl(clave);
    const r = await m.exec();
    const [errIncr, cuenta] = r?.[0] ?? [new Error('Redis no devolvió el contador.'), 0];
    if (errIncr) throw errIncr;
    const [errTtl, ttl] = r?.[2] ?? [null, ventanaSegundos];
    if (errTtl) throw errTtl;
    return {
      cuenta: typeof cuenta === 'number' ? cuenta : 0,
      segundosRestantes: typeof ttl === 'number' && ttl > 0 ? ttl : ventanaSegundos,
    };
  }
}
