/**
 * Dinero. Regla R8: enteros (la unidad mínima de la moneda) + código ISO-4217.
 *
 * Por qué no coma flotante: `0.1 + 0.2 !== 0.3`. En un cotizador que suma ítems con markup
 * porcentual en varias monedas, ese error se acumula y aparece como una diferencia de centavos
 * entre lo cotizado y lo cobrado. Es pequeño y es imperdonable: destruye la confianza en el sistema.
 */

import { DomainError } from './errors.js';

/** Monedas habilitadas. Colombia es el mercado base; USD aparece en producto receptivo. */
export const MONEDAS = {
  COP: { decimales: 0 },
  USD: { decimales: 2 },
  EUR: { decimales: 2 },
  MXN: { decimales: 2 },
} as const;

export type CodigoMoneda = keyof typeof MONEDAS;

export class MonedaInvalidaError extends DomainError {
  readonly code = 'MONEDA_INVALIDA';
  constructor(readonly valor: string) {
    super(`'${valor}' no es una moneda habilitada`);
  }
}

export class MonedasIncompatiblesError extends DomainError {
  readonly code = 'MONEDAS_INCOMPATIBLES';
  constructor(
    readonly a: CodigoMoneda,
    readonly b: CodigoMoneda,
  ) {
    super(`No se puede operar ${a} con ${b} sin conversión explícita`);
  }
}

export class ImporteInvalidoError extends DomainError {
  readonly code = 'IMPORTE_INVALIDO';
  constructor(readonly motivo: string) {
    super(`Importe inválido: ${motivo}`);
  }
}

export function esCodigoMoneda(valor: string): valor is CodigoMoneda {
  return Object.prototype.hasOwnProperty.call(MONEDAS, valor);
}

/**
 * Un importe monetario. Inmutable.
 *
 * `unidades` es siempre un entero en la unidad mínima de la moneda:
 * COP no tiene decimales, así que 1 unidad = 1 peso.
 * USD tiene 2, así que 1 unidad = 1 centavo.
 */
export class Money {
  private constructor(
    readonly unidades: bigint,
    readonly moneda: CodigoMoneda,
  ) {}

  /** Construye desde la unidad mínima. Es la forma canónica: así viaja a la base de datos. */
  static desdeUnidades(unidades: bigint | number, moneda: string): Money {
    if (!esCodigoMoneda(moneda)) throw new MonedaInvalidaError(moneda);

    if (typeof unidades === 'number') {
      if (!Number.isInteger(unidades)) {
        throw new ImporteInvalidoError(
          `${unidades} no es entero; usa la unidad mínima de la moneda`,
        );
      }
      if (!Number.isSafeInteger(unidades)) {
        throw new ImporteInvalidoError(`${unidades} excede el entero seguro de JavaScript`);
      }
      return new Money(BigInt(unidades), moneda);
    }

    return new Money(unidades, moneda);
  }

  /**
   * Construye desde la unidad mayor (pesos, dólares), aceptando una cadena.
   *
   * Acepta cadena a propósito: `Money.desdeDecimal(0.1 + 0.2, 'USD')` ya recibe un número
   * corrompido y no hay nada que hacer. Entrada de usuario y de tarifarios → cadena.
   */
  static desdeDecimal(valor: string | number, moneda: string): Money {
    if (!esCodigoMoneda(moneda)) throw new MonedaInvalidaError(moneda);

    const texto = typeof valor === 'number' ? String(valor) : valor.trim();
    if (!/^-?\d+(\.\d+)?$/.test(texto)) {
      throw new ImporteInvalidoError(`'${texto}' no tiene formato decimal`);
    }

    const decimales = MONEDAS[moneda].decimales;
    const negativo = texto.startsWith('-');
    const [entera = '0', fraccion = ''] = texto.replace('-', '').split('.');

    if (fraccion.length > decimales) {
      throw new ImporteInvalidoError(
        `${moneda} admite ${decimales} decimales y '${texto}' trae ${fraccion.length}. ` +
          'Redondear es una decisión de negocio: hazla explícita antes de construir el importe.',
      );
    }

    const unidades = BigInt(entera + fraccion.padEnd(decimales, '0'));
    return new Money(negativo ? -unidades : unidades, moneda);
  }

  static cero(moneda: CodigoMoneda): Money {
    return new Money(0n, moneda);
  }

  private mismaMoneda(otro: Money): void {
    if (this.moneda !== otro.moneda) {
      throw new MonedasIncompatiblesError(this.moneda, otro.moneda);
    }
  }

  sumar(otro: Money): Money {
    this.mismaMoneda(otro);
    return new Money(this.unidades + otro.unidades, this.moneda);
  }

  restar(otro: Money): Money {
    this.mismaMoneda(otro);
    return new Money(this.unidades - otro.unidades, this.moneda);
  }

  /** Multiplica por una cantidad entera: 3 pasajeros, 2 habitaciones. */
  porCantidad(cantidad: number): Money {
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new ImporteInvalidoError(
        `la cantidad debe ser un entero no negativo, no '${cantidad}'`,
      );
    }
    return new Money(this.unidades * BigInt(cantidad), this.moneda);
  }

  /**
   * Aplica un porcentaje (markup, comisión, impuesto) y devuelve el resultado.
   *
   * El redondeo es **medio hacia arriba**, que es lo que espera un comercial: 0.5 sube.
   * Se hace con enteros para no introducir error de coma flotante en el propio redondeo.
   */
  aplicarPorcentaje(porcentaje: number): Money {
    if (!Number.isFinite(porcentaje)) {
      throw new ImporteInvalidoError(`'${porcentaje}' no es un porcentaje finito`);
    }

    // Se trabaja en milésimas de punto porcentual para admitir 12,5% sin perder precisión.
    const milesimas = BigInt(Math.round(porcentaje * 1000));
    const producto = this.unidades * milesimas;
    const divisor = 100_000n;

    const negativo = producto < 0n;
    const absoluto = negativo ? -producto : producto;
    const redondeado = (absoluto + divisor / 2n) / divisor;

    return new Money(negativo ? -redondeado : redondeado, this.moneda);
  }

  /** El importe más el porcentaje. `aplicarMarkup(20)` sobre 100 da 120. */
  aplicarMarkup(porcentaje: number): Money {
    return this.sumar(this.aplicarPorcentaje(porcentaje));
  }

  esCero(): boolean {
    return this.unidades === 0n;
  }

  esNegativo(): boolean {
    return this.unidades < 0n;
  }

  mayorQue(otro: Money): boolean {
    this.mismaMoneda(otro);
    return this.unidades > otro.unidades;
  }

  igualA(otro: Money): boolean {
    return this.moneda === otro.moneda && this.unidades === otro.unidades;
  }

  /** Representación decimal para mostrar. **No usar para calcular.** */
  aDecimal(): string {
    const decimales = MONEDAS[this.moneda].decimales;
    const negativo = this.unidades < 0n;
    const absoluto = (negativo ? -this.unidades : this.unidades).toString();

    if (decimales === 0) return `${negativo ? '-' : ''}${absoluto}`;

    const relleno = absoluto.padStart(decimales + 1, '0');
    const entera = relleno.slice(0, -decimales);
    const fraccion = relleno.slice(-decimales);
    return `${negativo ? '-' : ''}${entera}.${fraccion}`;
  }

  /** Forma de persistencia: lo que va a las columnas `*_units` y `*_currency`. */
  aPersistencia(): { unidades: bigint; moneda: CodigoMoneda } {
    return { unidades: this.unidades, moneda: this.moneda };
  }

  toString(): string {
    return `${this.aDecimal()} ${this.moneda}`;
  }
}
