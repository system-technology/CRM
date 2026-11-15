/**
 * T-226 (b): comprobación de arranque de las claves de campos sensibles (ADR-0015).
 *
 * Si la base guarda filas cifradas con una versión de clave que este proceso no tiene cargada
 * (ni la vigente ni, si hay `CAMPOS_SENSIBLES_KEY_PREVIOUS`, `vigente - 1`), el proceso no arranca:
 * de lo contrario serviría errores al leer o, peor, mostraría vacío lo que está ilegible.
 *
 * Lo que decide qué versión abre qué es la misma regla que `CifradoDeCampos.maestraDe`. El mensaje
 * nombra versiones, nunca claves.
 *
 * La lectura de las versiones va detrás de `PuertoVersionesDeClave`. Su adaptador de hoy
 * (`versiones-de-clave.prisma.ts`) no necesita migración pero recorre agencia por agencia bajo RLS;
 * una función SECURITY DEFINER que devuelva solo `(version)` distintas lo sustituiría sin tocar
 * esto (TODO en el adaptador).
 */
export abstract class PuertoVersionesDeClave {
  /** Las versiones de clave DISTINTAS con filas cifradas, en todas las agencias. Sin datos. */
  abstract versionesEnUso(): Promise<number[]>;
}

export class ClaveDeCamposHuerfanaError extends Error {
  constructor(readonly versionesSinClave: number[]) {
    super(
      `Hay datos cifrados con la versión de clave ${versionesSinClave.join(', ')} y este proceso ` +
        'no tiene clave que los abra (ADR-0015). Carga CAMPOS_SENSIBLES_KEY_PREVIOUS con la ' +
        'maestra anterior, o restaura la configuración de claves previa. No se arranca para no ' +
        'servir errores ni datos vacíos.',
    );
    this.name = 'ClaveDeCamposHuerfanaError';
  }
}

export interface ClavesCargadas {
  version: number;
  /** Hay maestra para `version - 1`. */
  tienePrevia: boolean;
}

/** Las versiones en uso que ni la vigente ni la previa cargada abren. Orden ascendente, sin repetir. */
export function versionesSinClave(enUso: readonly number[], cargadas: ClavesCargadas): number[] {
  const abren = (v: number): boolean =>
    v === cargadas.version || (cargadas.tienePrevia && v === cargadas.version - 1);
  return [...new Set(enUso)].filter((v) => !abren(v)).sort((a, b) => a - b);
}

/** Lanza `ClaveDeCamposHuerfanaError` si alguna versión en uso no tiene clave que la abra. */
export async function exigirClaveParaLosDatos(
  puerto: PuertoVersionesDeClave,
  cargadas: ClavesCargadas,
): Promise<void> {
  const huerfanas = versionesSinClave(await puerto.versionesEnUso(), cargadas);
  if (huerfanas.length > 0) throw new ClaveDeCamposHuerfanaError(huerfanas);
}

/** Atajo para los puntos de arranque: lee la configuración del entorno y comprueba. */
export async function comprobarClavesAlArrancar(
  puerto: PuertoVersionesDeClave,
  claves: { version: number; anterior: Buffer | null },
): Promise<void> {
  await exigirClaveParaLosDatos(puerto, {
    version: claves.version,
    tienePrevia: claves.anterior !== null,
  });
}
