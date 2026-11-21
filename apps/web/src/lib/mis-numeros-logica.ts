/**
 * Lógica de presentación de «Mis números» y de «Hoy» (T-343). Pura y sin red: se prueba aparte.
 */

/** «1 niño», «2 niños»: el plural correcto según la cantidad. */
export function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}
