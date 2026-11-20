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
  ContadorDeFallosDeCodigo,
  PREFIJO_DE_FALLOS_DE_INGRESO,
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
    private readonly contador: ContadorDeFallosDeCodigo,
    private readonly secreto: string,
  ) {}

  private clave(sujeto: SujetoDelTope): string {
    return claveDeLimite(this.secreto, sujeto.tipo, sujeto.valor, PREFIJO_DE_FALLOS_DE_INGRESO);
  }

  /** `true` si el sujeto agotó su tope. No escribe nada. */
  async estaBloqueado(sujeto: SujetoDelTope): Promise<boolean> {
    return !(await this.contador.quedaCupo(this.clave(sujeto), TOPE_DE_FALLOS_DE_INGRESO.maximo));
  }

  /** Cuenta un fallo: siempre el mismo INSERT, barrido y recuento, esté o no bloqueado. */
  async registrarFallo(sujeto: SujetoDelTope): Promise<void> {
    await this.contador.consumir(
      this.clave(sujeto),
      TOPE_DE_FALLOS_DE_INGRESO.maximo,
      TOPE_DE_FALLOS_DE_INGRESO.ventanaSegundos,
      PREFIJO_DE_FALLOS_DE_INGRESO,
    );
  }
}
