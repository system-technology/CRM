/**
 * Decisión PURA de si `sembrar-credenciales-dev` puede poner una contraseña de desarrollo.
 *
 * Intención de la guardia: jamás una contraseña conocida donde hay usuarios reales. Por eso, en
 * una base remota (p. ej. Neon de desarrollo) exige un opt-in explícito Y que no exista ni una
 * sola identidad ajena a la semilla. Los motivos nunca incluyen cadenas de conexión, correos ni
 * datos personales: solo el número de identidades ajenas.
 */
export const DOMINIO_DE_LA_SEMILLA = '@agenciademo.test';
export const LONGITUD_MINIMA_DE_CLAVE = 12;
const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface EntradaGuardiaDeSiembra {
  readonly appEnv: string | undefined;
  /** Solo el hostname, nunca la cadena de conexión. */
  readonly anfitrion: string;
  /** Valor crudo de IDENTIDAD_DEV_PERMITIR_REMOTO. */
  readonly permitirRemoto: string | undefined;
  readonly claveLongitud: number;
  /** Identidades cuyo correo NO termina en el dominio de la semilla. */
  readonly identidadesAjenas: number;
}

export type DecisionDeSiembra =
  | { readonly permitido: true; readonly remoto: boolean }
  | { readonly permitido: false; readonly motivo: string };

export function esAnfitrionLocal(anfitrion: string): boolean {
  return ANFITRIONES_LOCALES.has(anfitrion);
}

export function decidirSiSePuedeSembrar(entrada: EntradaGuardiaDeSiembra): DecisionDeSiembra {
  if (entrada.appEnv !== 'local') {
    return { permitido: false, motivo: 'Negado: este script solo corre con APP_ENV=local.' };
  }
  if (entrada.claveLongitud < LONGITUD_MINIMA_DE_CLAVE) {
    return {
      permitido: false,
      motivo: `Falta IDENTIDAD_DEV_PASSWORD (${LONGITUD_MINIMA_DE_CLAVE}+ caracteres). Este script no inventa claves.`,
    };
  }
  if (esAnfitrionLocal(entrada.anfitrion)) return { permitido: true, remoto: false };

  if (entrada.permitirRemoto !== 'si') {
    return {
      permitido: false,
      motivo:
        `Negado: "${entrada.anfitrion}" no es un anfitrión local. Para una base remota de ` +
        'desarrollo con datos sintéticos, pasa IDENTIDAD_DEV_PERMITIR_REMOTO=si en la orden.',
    };
  }
  if (entrada.identidadesAjenas !== 0) {
    return {
      permitido: false,
      motivo:
        `Negado: la base remota "${entrada.anfitrion}" tiene ${entrada.identidadesAjenas} ` +
        `identidad(es) que no son de la semilla (${DOMINIO_DE_LA_SEMILLA}). No se pone una ` +
        'contraseña conocida donde hay usuarios reales.',
    };
  }
  return { permitido: true, remoto: true };
}
