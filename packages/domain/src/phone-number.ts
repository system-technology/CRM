/**
 * `PhoneNumber` — teléfono en formato E.164 (`+573001234567`). Es la llave natural del contacto
 * y del canal de WhatsApp: dos escrituras distintas del mismo número tienen que dar el mismo valor
 * o la agencia termina con el mismo cliente duplicado.
 *
 * Puro: sin librerías de telefonía. Normaliza la escritura humana (espacios, guiones, paréntesis,
 * puntos, prefijo `00`) y exige E.164 estricto. NO adivina el país: un número sin `+` ni `00` es
 * ambiguo y se rechaza, porque inventar el prefijo equivocado crea un contacto que nunca recibirá
 * el mensaje.
 */
import { InvariantError } from './errors.js';

export class TelefonoInvalidoError extends InvariantError {
  readonly code = 'TELEFONO_INVALIDO';
  constructor(readonly entrada: string) {
    super(
      `'${entrada}' no es un teléfono válido. Se espera formato internacional E.164, por ejemplo ` +
        '+573001234567 (con el código de país).',
    );
  }
}

const E164 = /^\+[1-9]\d{7,14}$/;

export class PhoneNumber {
  private constructor(readonly e164: string) {}

  /** Acepta la escritura humana y devuelve el valor normalizado, o lanza. */
  static parse(entrada: string): PhoneNumber {
    let t = entrada.trim().replace(/[\s().-]/g, '');
    if (t.startsWith('00')) t = `+${t.slice(2)}`;
    if (!E164.test(t)) throw new TelefonoInvalidoError(entrada);
    return new PhoneNumber(t);
  }

  equals(otro: PhoneNumber): boolean {
    return this.e164 === otro.e164;
  }

  toString(): string {
    return this.e164;
  }
}
