/**
 * Decisión PURA de si `sembrar-demo-cifrada` puede escribir la bandeja de demostración.
 *
 * Misma intención que `guardia-de-canal-de-prueba.ts`: jamás escribir conversaciones sintéticas
 * donde hay agencias reales. En una base remota exige un opt-in explícito Y que no exista ni una
 * agencia ajena a la semilla. Los motivos no incluyen valores del entorno: solo nombres y conteos.
 */
import { esAnfitrionLocal, SLUG_DE_LA_AGENCIA_DEMO } from './guardia-de-canal-de-prueba.js';

export interface EntradaGuardiaDeDemoCifrada {
  readonly appEnv: string | undefined;
  /** Solo el hostname, nunca la cadena de conexión. */
  readonly anfitrion: string;
  /** Valor crudo de DEMO_CIFRADA_PERMITIR_REMOTO. */
  readonly permitirRemoto: string | undefined;
  /** Agencias cuyo slug NO es el de la semilla. */
  readonly agenciasAjenas: number;
}

export type DecisionDeDemoCifrada =
  | { readonly permitido: true; readonly remoto: boolean }
  | { readonly permitido: false; readonly motivo: string };

export function decidirSiSePuedeSembrarLaDemoCifrada(
  entrada: EntradaGuardiaDeDemoCifrada,
): DecisionDeDemoCifrada {
  if (entrada.appEnv !== 'local') {
    return { permitido: false, motivo: 'Negado: este script solo corre con APP_ENV=local.' };
  }
  if (esAnfitrionLocal(entrada.anfitrion)) return { permitido: true, remoto: false };

  if (entrada.permitirRemoto !== 'si') {
    return {
      permitido: false,
      motivo:
        `Negado: "${entrada.anfitrion}" no es un anfitrión local. Para una base remota de ` +
        'desarrollo con datos sintéticos, pasa DEMO_CIFRADA_PERMITIR_REMOTO=si en la orden.',
    };
  }
  if (entrada.agenciasAjenas !== 0) {
    return {
      permitido: false,
      motivo:
        `Negado: la base remota "${entrada.anfitrion}" tiene ${entrada.agenciasAjenas} ` +
        `agencia(s) que no son la de la semilla ("${SLUG_DE_LA_AGENCIA_DEMO}"). No se siembra ` +
        'una bandeja de demostración donde hay agencias reales.',
    };
  }
  return { permitido: true, remoto: true };
}
