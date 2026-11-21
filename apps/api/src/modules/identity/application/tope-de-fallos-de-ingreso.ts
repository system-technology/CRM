/**
 * Tope de fallos del ingreso con contraseña, por identificador (ADR-0031 §4): 10 en 15 minutos.
 *
 * La clave es la IDENTIDAD resuelta —correo y apodo comparten contador, y probar los dos no duplica
 * los intentos—; si no hay identidad, el identificador normalizado. Va en HMAC con el secreto de la
 * aplicación y con prefijo propio (`viajapro:ingreso-fallos:`), aparte del contador del código.
 *
 * El estado del contador no se ve desde fuera: quien lo agota recibe lo mismo que quien falla una
 * vez (ver `ingreso-por-identificador.ts`). La ventana es deslizante mientras dure el ataque.
 * El bloqueo deliberado de un apodo ajeno es el precio conocido (T-313).
 */
import {
  claveDeLimite,
  PREFIJO_DE_FALLOS_DE_INGRESO,
  ReservaDeIntentos,
} from './limitador-de-envios.js';

export const TOPE_DE_FALLOS_DE_INGRESO = { maximo: 10, ventanaSegundos: 15 * 60 } as const;

export type SujetoDelTope =
  { tipo: 'identidad'; valor: string } | { tipo: 'identificador'; valor: string };

/**
 * Clase simple, sin decoradores, como `TopeDeFallosDeCodigo`: el módulo la construye con el
 * contador de Postgres y el secreto de la aplicación (`identity.module.ts`).
 */
export class TopeDeFallosDeIngreso {
  constructor(
    private readonly contador: ReservaDeIntentos,
    private readonly secreto: string,
  ) {}

  private clave(sujeto: SujetoDelTope): string {
    return claveDeLimite(this.secreto, sujeto.tipo, sujeto.valor, PREFIJO_DE_FALLOS_DE_INGRESO);
  }

  /**
   * Reserva el intento ANTES de comprobar. `bloqueado` si, contando la propia reserva, hay más de
   * 10 en la ventana. Bloqueado o no, la escritura es la misma (INSERT, barrido, recuento).
   */
  async reservar(sujeto: SujetoDelTope): Promise<{ bloqueado: boolean; reservaId: string }> {
    const r = await this.contador.reservar(
      this.clave(sujeto),
      TOPE_DE_FALLOS_DE_INGRESO.maximo,
      TOPE_DE_FALLOS_DE_INGRESO.ventanaSegundos,
      PREFIJO_DE_FALLOS_DE_INGRESO,
    );
    return { bloqueado: !r.cabe, reservaId: r.reservaId };
  }

  /** Devuelve el cupo: el ingreso salió bien, o el intento no llegó a probar la contraseña. */
  liberar(reservaId: string): Promise<void> {
    return this.contador.liberar(reservaId);
  }
}
