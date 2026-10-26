/**
 * Decisión PURA de si `registrar-canal-de-prueba` puede registrar el número de prueba de Meta.
 *
 * Misma intención que `identity/scripts/guardia-de-siembra-dev.ts`: jamás tocar el enrutamiento
 * de WhatsApp donde hay agencias reales. En una base remota (p. ej. Neon de desarrollo) exige un
 * opt-in explícito Y que no exista ni una agencia ajena a la semilla. Los motivos nunca incluyen
 * valores del entorno (ni identificadores de Meta, ni cadenas de conexión): solo nombres de
 * variable y conteos.
 */
export const SLUG_DE_LA_AGENCIA_DEMO = 'agencia-demo';
const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
/** `phone_number_id` y `waba_id` de Meta son numéricos; `canales.phone_number_id` es VARCHAR(32). */
const FORMATO_DE_ID_DE_META = /^\d{1,32}$/;

export interface EntradaGuardiaDeCanalDePrueba {
  readonly appEnv: string | undefined;
  /** Solo el hostname, nunca la cadena de conexión. */
  readonly anfitrion: string;
  /** Valor crudo de CANAL_PRUEBA_PERMITIR_REMOTO. */
  readonly permitirRemoto: string | undefined;
  /** Valor crudo de META_PHONE_NUMBER_ID_PRUEBA. */
  readonly phoneNumberId: string | undefined;
  /** Valor crudo de META_WABA_ID_PRUEBA. */
  readonly wabaId: string | undefined;
  /** Agencias cuyo slug NO es el de la semilla. */
  readonly agenciasAjenas: number;
}

export type DecisionDeCanalDePrueba =
  | { readonly permitido: true; readonly remoto: boolean }
  | { readonly permitido: false; readonly motivo: string };

export function esAnfitrionLocal(anfitrion: string): boolean {
  return ANFITRIONES_LOCALES.has(anfitrion);
}

export function esIdDeMetaValido(valor: string | undefined): valor is string {
  return valor !== undefined && FORMATO_DE_ID_DE_META.test(valor);
}

export function decidirSiSePuedeRegistrarElCanalDePrueba(
  entrada: EntradaGuardiaDeCanalDePrueba,
): DecisionDeCanalDePrueba {
  if (entrada.appEnv !== 'local') {
    return { permitido: false, motivo: 'Negado: este script solo corre con APP_ENV=local.' };
  }
  for (const [nombre, valor] of [
    ['META_PHONE_NUMBER_ID_PRUEBA', entrada.phoneNumberId],
    ['META_WABA_ID_PRUEBA', entrada.wabaId],
  ] as const) {
    if (!valor) {
      return { permitido: false, motivo: `Falta ${nombre} en el entorno.` };
    }
    if (!esIdDeMetaValido(valor)) {
      return {
        permitido: false,
        motivo: `${nombre} no es un identificador numérico de Meta (solo dígitos, hasta 32).`,
      };
    }
  }
  if (esAnfitrionLocal(entrada.anfitrion)) return { permitido: true, remoto: false };

  if (entrada.permitirRemoto !== 'si') {
    return {
      permitido: false,
      motivo:
        `Negado: "${entrada.anfitrion}" no es un anfitrión local. Para una base remota de ` +
        'desarrollo con datos sintéticos, pasa CANAL_PRUEBA_PERMITIR_REMOTO=si en la orden.',
    };
  }
  if (entrada.agenciasAjenas !== 0) {
    return {
      permitido: false,
      motivo:
        `Negado: la base remota "${entrada.anfitrion}" tiene ${entrada.agenciasAjenas} ` +
        `agencia(s) que no son la de la semilla ("${SLUG_DE_LA_AGENCIA_DEMO}"). No se registra ` +
        'un canal de prueba donde hay agencias reales.',
    };
  }
  return { permitido: true, remoto: true };
}
