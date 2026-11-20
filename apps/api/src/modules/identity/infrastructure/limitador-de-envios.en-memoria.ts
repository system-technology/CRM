import { LimitadorDeEnvios } from '../application/limitador-de-envios.js';

/** Tope de claves vivas: acota la memoria si alguien rota correos o IP. */
export const MAXIMO_DE_CLAVES_EN_MEMORIA = 10_000;

/**
 * Se elige con `LIMITADOR_OTP=memoria` (pruebas) y siempre en modo `unico` (ADR-0019). No sirve con
 * más de una réplica: en modo `escalado` se usa Redis. **Un reinicio del proceso pone a cero todas
 * las ventanas** (en modo único, el plan gratuito duerme el proceso a los 15 minutos): por eso el
 * tope de fallos del código NO usa este limitador en producción sino Postgres.
 *
 * Acotado: al insertar se barren las entradas vencidas y, si aun así se supera
 * `MAXIMO_DE_CLAVES_EN_MEMORIA`, se descarta la más antigua (el orden de un `Map` es el de alta).
 */
export class LimitadorDeEnviosEnMemoria extends LimitadorDeEnvios {
  private readonly cuentas = new Map<string, { n: number; vence: number }>();

  constructor(private readonly maximoDeClaves: number = MAXIMO_DE_CLAVES_EN_MEMORIA) {
    super();
  }

  consumir(clave: string, maximo: number, ventanaSegundos: number): Promise<boolean> {
    const ahora = Date.now();
    const actual = this.cuentas.get(clave);
    if (!actual || actual.vence <= ahora) this.hacerSitio(ahora);
    const cuenta =
      actual && actual.vence > ahora ? actual : { n: 0, vence: ahora + ventanaSegundos * 1000 };
    cuenta.n += 1;
    this.cuentas.set(clave, cuenta);
    return Promise.resolve(cuenta.n <= maximo);
  }

  quedaCupo(clave: string, maximo: number): Promise<boolean> {
    const actual = this.cuentas.get(clave);
    return Promise.resolve(!actual || actual.vence <= Date.now() || actual.n < maximo);
  }

  /** Cantidad de claves guardadas (para pruebas). */
  get tamano(): number {
    return this.cuentas.size;
  }

  private hacerSitio(ahora: number): void {
    for (const [k, v] of this.cuentas) if (v.vence <= ahora) this.cuentas.delete(k);
    while (this.cuentas.size >= this.maximoDeClaves) {
      const primera = this.cuentas.keys().next();
      if (primera.done) break;
      this.cuentas.delete(primera.value);
    }
  }
}
