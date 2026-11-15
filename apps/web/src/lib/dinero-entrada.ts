/**
 * Parseo de montos escritos por una persona a unidades mínimas de la moneda (R8).
 *
 * «Unidad mínima» no es «centavos»: en COP es el peso (0 decimales); en USD/EUR, el centavo
 * (2 decimales). Solo aritmética de cadenas y enteros: nada de `float`.
 *
 * Reglas de entrada: se ignoran `$`, espacios y el código de moneda. Un separador seguido de
 * 1 o 2 dígitos al final es la parte decimal; cualquier otro separador es de miles. Por eso
 * «5.000.000», «5,000,000» y «5000000» valen lo mismo, y «12,50» (USD) vale 1250 unidades.
 */

const DECIMALES_POR_MONEDA: Record<string, number> = { COP: 0 };

export function decimalesDeMoneda(moneda: string): number {
  return DECIMALES_POR_MONEDA[moneda.toUpperCase()] ?? 2;
}

/** Devuelve las unidades mínimas como cadena entera, o `null` si no hay un monto válido > 0. */
export function parsearMontoAUnidades(texto: string, moneda: string): string | null {
  const limpio = texto.replace(/[^\d.,]/g, '');
  if (!limpio) return null;

  const decimales = decimalesDeMoneda(moneda);
  const m = /^(.*?)[.,](\d{1,2})$/.exec(limpio);
  let enteros = limpio;
  let fraccion = '';
  // Con 0 decimales (COP) un sufijo de 1-2 dígitos también se trata como fracción, y se redondea.
  if (m) {
    enteros = m[1] ?? '';
    fraccion = m[2] ?? '';
  }
  enteros = enteros.replace(/[.,]/g, '');
  if (!enteros) enteros = '0';

  let unidades: bigint;
  if (decimales === 0) {
    unidades = BigInt(enteros) + (fraccion && Number(fraccion.padEnd(2, '0')) >= 50 ? 1n : 0n);
  } else {
    unidades = BigInt(enteros + fraccion.padEnd(decimales, '0').slice(0, decimales));
  }
  return unidades > 0n ? unidades.toString() : null;
}
