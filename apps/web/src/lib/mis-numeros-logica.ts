/**
 * Lógica de presentación de «Mis números» y de «Hoy» (T-343). Pura y sin red: se prueba aparte.
 */

/** «1 niño», «2 niños»: el plural correcto según la cantidad. */
export function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

/** Frase única para avisar que una cifra de «por cobrar» es un mínimo y no el total. */
export const AVISO_POR_COBRAR_TRUNCADO =
  'Hay más archivos abiertos de los que se revisan de una vez: estas cifras son un mínimo, no el total.';

/** «5 archivos» / «5 o más archivos»; «1 archivo» solo si es exactamente 1 y no hay truncado. */
export function textoDeArchivos(archivos: number, truncado: boolean): string {
  if (truncado) return `${archivos} o más archivos`;
  return plural(archivos, 'archivo', 'archivos');
}

/**
 * Los tramos de antigüedad de las cotizaciones enviadas, en el orden en que se pintan. El servidor
 * ya contó (T-528); aquí solo se ordenan y se rotulan.
 */
export function tramosDeAntiguedad(porAntiguedad: {
  hastaTresDias: number;
  deCuatroASiete: number;
  masDeSiete: number;
}): Array<{
  clave: 'hastaTresDias' | 'deCuatroASiete' | 'masDeSiete';
  rotulo: string;
  cantidad: number;
}> {
  return [
    { clave: 'hastaTresDias', rotulo: 'De 0 a 3 días', cantidad: porAntiguedad.hastaTresDias },
    { clave: 'deCuatroASiete', rotulo: 'De 4 a 7 días', cantidad: porAntiguedad.deCuatroASiete },
    { clave: 'masDeSiete', rotulo: 'Más de 7 días', cantidad: porAntiguedad.masDeSiete },
  ];
}
