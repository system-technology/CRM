/**
 * Cómo se forma el precio de venta a partir del neto del mayorista.
 *
 * **La regla del propietario, 2026-10-13:** «tarifario neto del mayorista, margen el 20 %».
 * Suena a una multiplicación y no lo es, porque **«margen del 20 %» tiene dos lecturas y dan
 * números distintos**:
 *
 * | Lectura | Cómo lo dice una agencia | Sobre un neto de $1.000.000 |
 * |---|---|---|
 * | `SOBRE_EL_NETO` | «le subo el 20 %» | venta **$1.200.000** |
 * | `SOBRE_LA_VENTA` | «me deja el 20 %» | venta **$1.250.000** |
 *
 * Son $50.000 por silla. En un bus de cuarenta, dos millones por salida. Por eso la base **no se
 * adivina en el código**: viaja en la política del tenant, con `SOBRE_EL_NETO` por defecto, que es
 * la lectura más frecuente en agencia minorista colombiana. Cambiarla es un campo de una tabla.
 *
 * **Y por eso esto vive aquí y no en el cotizador.** Es aritmética pura: ni reloj, ni base de
 * datos, ni tenant. Lo que decide *qué* política aplica es de la capa de aplicación; lo que la
 * política *significa* es esto, y se puede probar con un `expect`.
 *
 * Ver ADR-0009 §2, eje 2, y ADR-0006 (nivel 1: configuración por tenant).
 */

import { ImporteInvalidoError, Money } from './money.js';

/**
 * Sobre qué se calcula el porcentaje.
 *
 * El espejo Zod de esta lista vive en `@viajapro/contracts`. Si cambia una, cambia la otra —es la
 * misma convención que ya siguen `ACOMODACIONES` y `TIPOS_PASAJERO`.
 */
export const BASES_DEL_MARGEN = ['SOBRE_EL_NETO', 'SOBRE_LA_VENTA'] as const;
export type BaseDelMargen = (typeof BASES_DEL_MARGEN)[number];

/**
 * Quién manda cuando el mayorista sube su neto.
 *
 * `DERIVADA_DEL_NETO`: la venta se recalcula y la agencia conserva su margen.
 * `FIJADA_EN_EL_TARIFARIO`: el número de la hoja es ley, y el porcentaje queda como sugerencia al
 * capturar y como cifra en el informe. **Las dos existen de verdad en el mercado.**
 */
export const ORIGENES_DE_LA_VENTA = ['DERIVADA_DEL_NETO', 'FIJADA_EN_EL_TARIFARIO'] as const;
export type OrigenDeLaVenta = (typeof ORIGENES_DE_LA_VENTA)[number];

export interface PoliticaDePrecio {
  /** Puntos porcentuales. Admite decimales: 12,5 es válido. */
  readonly porcentaje: number;
  readonly base: BaseDelMargen;
  readonly origenDeLaVenta: OrigenDeLaVenta;
  /**
   * Paso de redondeo de la venta, en unidades mínimas de la moneda. `0` o `1` es no redondear.
   *
   * Existe porque ninguna hoja de tarifas colombiana publica $1.236.432. Se redondea **la venta,
   * nunca el neto**: el neto es lo que cobra el mayorista y no es nuestro para redondearlo.
   */
  readonly redondeoVenta: number;
}

/** Lo que recibe una agencia nueva si no configura nada. La instrucción del propietario. */
export const POLITICA_POR_DEFECTO: PoliticaDePrecio = {
  porcentaje: 20,
  base: 'SOBRE_EL_NETO',
  origenDeLaVenta: 'DERIVADA_DEL_NETO',
  redondeoVenta: 1_000,
};

/** El margen de una línea. `porcentaje` es `null` cuando el denominador es cero. */
export interface Margen {
  readonly importe: Money;
  readonly porcentaje: number | null;
  /** Se devuelve junto al número porque un porcentaje sin su base no significa nada. */
  readonly base: BaseDelMargen;
}

/** Se trabaja en milésimas de punto porcentual para admitir 12,5 % sin error de coma flotante. */
const ESCALA = 100_000n;

function milesimas(porcentaje: number): bigint {
  if (!Number.isFinite(porcentaje)) {
    throw new ImporteInvalidoError(`'${porcentaje}' no es un porcentaje finito`);
  }
  if (porcentaje < 0) {
    throw new ImporteInvalidoError(
      'el margen no puede ser negativo: vender bajo el neto es pérdida',
    );
  }
  return BigInt(Math.round(porcentaje * 1000));
}

/** División entera con redondeo medio hacia arriba, sobre magnitudes. */
function dividirRedondeando(numerador: bigint, divisor: bigint): bigint {
  const negativo = numerador < 0n;
  const absoluto = negativo ? -numerador : numerador;
  const resultado = (absoluto + divisor / 2n) / divisor;
  return negativo ? -resultado : resultado;
}

/**
 * Redondea a un múltiplo del paso, medio hacia arriba.
 *
 * `redondearA(Money COP 1_236_432, 1_000)` → `1_236_000`.
 */
export function redondearA(importe: Money, paso: number): Money {
  if (!Number.isInteger(paso) || paso < 0) {
    throw new ImporteInvalidoError(`'${paso}' no es un paso de redondeo válido`);
  }
  if (paso <= 1) return importe;

  const { unidades, moneda } = importe.aPersistencia();
  const p = BigInt(paso);
  const negativo = unidades < 0n;
  const absoluto = negativo ? -unidades : unidades;
  const redondeado = ((absoluto + p / 2n) / p) * p;

  return Money.desdeUnidades(negativo ? -redondeado : redondeado, moneda);
}

/**
 * El precio de venta que sale de un neto, según la política de la agencia.
 *
 * No consulta `origenDeLaVenta`: con `FIJADA_EN_EL_TARIFARIO` esta función sigue sirviendo, pero
 * como **sugerencia** al capturar, no como la verdad. Quién decide eso es la capa de aplicación.
 */
export function calcularVenta(neto: Money, politica: PoliticaDePrecio): Money {
  const p = milesimas(politica.porcentaje);

  if (politica.base === 'SOBRE_EL_NETO') {
    return redondearA(neto.aplicarMarkup(politica.porcentaje), politica.redondeoVenta);
  }

  // Comisión sobre la venta: venta = neto / (1 − p). Con p = 100 % la venta sería infinita y con
  // más, negativa; se corta aquí y no en una división por cero tres capas más abajo.
  if (p >= ESCALA) {
    throw new ImporteInvalidoError(
      'un margen sobre la venta del 100 % o más no tiene precio de venta finito',
    );
  }

  const { unidades, moneda } = neto.aPersistencia();
  const bruto = Money.desdeUnidades(dividirRedondeando(unidades * ESCALA, ESCALA - p), moneda);

  return redondearA(bruto, politica.redondeoVenta);
}

/**
 * El camino inverso: qué neto implica un precio de venta.
 *
 * **Para qué existe:** la hoja del piloto trae precios **de venta al público** y seguimos
 * esperando la de netos del mayorista. Con esto la semilla puede llevar un neto coherente con el
 * margen declarado — y quien lo use **tiene que marcarlo como derivado**, nunca como dato del
 * mayorista (ADR-0009, pregunta abierta 5).
 *
 * **No redondea.** El neto es del mayorista; redondearlo sería inventarlo dos veces.
 */
export function derivarNeto(venta: Money, politica: PoliticaDePrecio): Money {
  const p = milesimas(politica.porcentaje);
  const { unidades, moneda } = venta.aPersistencia();

  if (politica.base === 'SOBRE_EL_NETO') {
    return Money.desdeUnidades(dividirRedondeando(unidades * ESCALA, ESCALA + p), moneda);
  }

  if (p >= ESCALA) {
    throw new ImporteInvalidoError(
      'un margen sobre la venta del 100 % o más no deja neto que derivar',
    );
  }

  return Money.desdeUnidades(dividirRedondeando(unidades * (ESCALA - p), ESCALA), moneda);
}

/**
 * El margen de una línea, con su base declarada al lado.
 *
 * **`neto` nulo devuelve `null`, no cero.** Una tarifa sin neto cargado cotiza igual y reporta
 * **margen desconocido**, que es la verdad mientras esperamos el tarifario del mayorista. Decir
 * «margen $0» sería afirmar que vendemos a precio de costo, y eso es otra cosa (ADR-0009 §5).
 */
export function calcularMargen(
  neto: Money | null,
  venta: Money,
  base: BaseDelMargen,
): Margen | null {
  if (neto === null) return null;

  const importe = venta.restar(neto);
  const denominador = base === 'SOBRE_EL_NETO' ? neto : venta;
  const unidadesDenominador = denominador.aPersistencia().unidades;

  if (unidadesDenominador === 0n) return { importe, porcentaje: null, base };

  // Dos decimales, en enteros hasta el último paso: 18,33 % y no 18,329999999999998.
  const centesimas = dividirRedondeando(
    importe.aPersistencia().unidades * 10_000n,
    unidadesDenominador,
  );

  return { importe, porcentaje: Number(centesimas) / 100, base };
}
