/**
 * Los parámetros del barrido, con sus valores por defecto y su validación.
 *
 * Todo se lee del entorno y se valida: un `NaN` o un cero aquí no fallarían a gritos, harían un
 * barrido que no barre, y el síntoma sería «los mensajes tardan» semanas después.
 */

export interface ConfiguracionDelBarrido {
  /** Cada cuánto corre un barrido. */
  intervaloMs: number;
  /** Un change solo se barre si lleva al menos esto sin resolverse: no pisa al POST recién hecho. */
  antiguedadMinimaS: number;
  /** Filas por barrido. La función de base acepta de 1 a 1000. */
  limite: number;
  /**
   * Cuántas veces se reencola un mismo change antes de darlo por abandonado. Con el intervalo por
   * defecto son unos cinco minutos de reintentos del barrido, encima de los cinco intentos con
   * retroceso que ya hace BullMQ en cada uno: suficiente para una caída corta de la base, y no
   * un bucle eterno para un change que falla siempre.
   */
  maxReencolados: number;
}

export const POR_DEFECTO_DEL_BARRIDO: ConfiguracionDelBarrido = {
  intervaloMs: 30_000,
  antiguedadMinimaS: 30,
  limite: 500,
  maxReencolados: 10,
};

function entero(
  entorno: Record<string, string | undefined>,
  nombre: string,
  porDefecto: number,
  min: number,
  max: number,
): number {
  const crudo = entorno[nombre];
  if (crudo === undefined || crudo === '') return porDefecto;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${nombre} debe ser un entero entre ${min} y ${max}.`);
  }
  return n;
}

export function configuracionDelBarrido(
  entorno: Record<string, string | undefined> = process.env,
): ConfiguracionDelBarrido {
  return {
    intervaloMs: entero(
      entorno,
      'BARRIDO_INTERVALO_MS',
      POR_DEFECTO_DEL_BARRIDO.intervaloMs,
      1_000,
      3_600_000,
    ),
    antiguedadMinimaS: entero(
      entorno,
      'BARRIDO_ANTIGUEDAD_S',
      POR_DEFECTO_DEL_BARRIDO.antiguedadMinimaS,
      0,
      86_400,
    ),
    limite: entero(entorno, 'BARRIDO_LIMITE', POR_DEFECTO_DEL_BARRIDO.limite, 1, 1_000),
    maxReencolados: entero(
      entorno,
      'BARRIDO_MAX_REENCOLADOS',
      POR_DEFECTO_DEL_BARRIDO.maxReencolados,
      1,
      1_000,
    ),
  };
}
