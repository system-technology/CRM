import { LimitadorDeEnvios } from '../application/limitador-de-envios.js';

/**
 * Solo para pruebas: se elige con `LIMITADOR_OTP=memoria`. No sirve con más de una réplica.
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
}
