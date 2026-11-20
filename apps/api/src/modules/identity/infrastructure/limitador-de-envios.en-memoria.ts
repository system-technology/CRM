import { LimitadorDeEnvios } from '../application/limitador-de-envios.js';

/**
 * Se elige con `LIMITADOR_OTP=memoria` (pruebas) y siempre en modo `unico` (ADR-0019). No sirve con
 * más de una réplica: en modo `escalado` se usa Redis. **Un reinicio del proceso pone a cero todas
 * las ventanas**, incluida la de 24 h del tope de fallos del código.
 */
export class LimitadorDeEnviosEnMemoria extends LimitadorDeEnvios {
  private readonly cuentas = new Map<string, { n: number; vence: number }>();

  consumir(clave: string, maximo: number, ventanaSegundos: number): Promise<boolean> {
    const ahora = Date.now();
    const actual = this.cuentas.get(clave);
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
}
