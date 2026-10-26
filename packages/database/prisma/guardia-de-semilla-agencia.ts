/**
 * Decisión PURA de si `semilla-agencia-desde-json` puede sembrar una agencia de prospecto.
 *
 * Mismo patrón que `apps/api/src/modules/identity/scripts/guardia-de-siembra-dev.ts` y
 * `inbox/scripts/guardia-de-canal-de-prueba.ts` (no se importan de ahí: `packages/database` no
 * depende de `apps/api`; las constantes se repiten a propósito y son tres líneas). La intención:
 * jamás sembrar datos de un tercero ni crear identidades de desarrollo donde hay agencias o
 * usuarios reales. Los motivos nunca incluyen cadenas de conexión, rutas, correos ni valores del
 * catálogo: solo nombres de variable y conteos.
 */

import { isAbsolute, relative, resolve } from 'node:path';

export const DOMINIO_DE_LA_SEMILLA = '@agenciademo.test';
export const SLUG_DE_LA_AGENCIA_DEMO = 'agencia-demo';
const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function esAnfitrionLocal(anfitrion: string): boolean {
  return ANFITRIONES_LOCALES.has(anfitrion);
}

/** ¿`ruta` es `raiz` o está debajo? Rutas ya resueltas (y con `realpath`, quien llama). */
export function estaDentroDelRepositorio(ruta: string, raiz: string): boolean {
  const normalizar = (p: string): string =>
    process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
  const rel = relative(normalizar(raiz), normalizar(ruta));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Qué pasó al leer `CATALOGO_JSON`. Sin valores: el archivo es de un tercero. */
export type EstadoDelCatalogo =
  | { readonly estado: 'ok' }
  | { readonly estado: 'ausente' }
  | { readonly estado: 'no_existe' }
  | { readonly estado: 'dentro_del_repositorio' }
  | { readonly estado: 'json_invalido'; readonly detalle: string };

export interface EntradaGuardiaDeSemillaAgencia {
  readonly appEnv: string | undefined;
  /** Solo el hostname, nunca la cadena de conexión. */
  readonly anfitrion: string;
  /** Valor crudo de SEMILLA_AGENCIA_PERMITIR_REMOTO. */
  readonly permitirRemoto: string | undefined;
  readonly catalogo: EstadoDelCatalogo;
  /** Correo del dueño que se va a crear. */
  readonly correoDelDueno: string;
  /** Agencias cuyo slug NO es el de la demo ni el de la que se siembra. */
  readonly agenciasAjenas: number;
  /** Identidades cuyo correo NO termina en el dominio de la semilla. */
  readonly identidadesAjenas: number;
}

export type DecisionDeSemillaAgencia =
  | { readonly permitido: true; readonly remoto: boolean }
  | { readonly permitido: false; readonly motivo: string };

export function decidirSiSePuedeSembrarLaAgencia(
  entrada: EntradaGuardiaDeSemillaAgencia,
): DecisionDeSemillaAgencia {
  const negar = (motivo: string): DecisionDeSemillaAgencia => ({ permitido: false, motivo });

  if (entrada.appEnv !== 'local') {
    return negar('Negado: este script solo corre con APP_ENV=local.');
  }
  switch (entrada.catalogo.estado) {
    case 'ausente':
      return negar('Falta CATALOGO_JSON (ruta del archivo JSON, fuera del repositorio).');
    case 'no_existe':
      return negar('CATALOGO_JSON no apunta a un archivo que exista.');
    case 'dentro_del_repositorio':
      return negar(
        'Negado: CATALOGO_JSON está dentro del repositorio. El catálogo de un tercero no se ' +
          'versiona: guárdalo fuera y pasa esa ruta.',
      );
    case 'json_invalido':
      return negar(`CATALOGO_JSON no es un catálogo válido: ${entrada.catalogo.detalle}`);
    case 'ok':
      break;
  }
  if (!entrada.correoDelDueno.toLowerCase().endsWith(DOMINIO_DE_LA_SEMILLA)) {
    return negar(
      `Negado: el correo del dueño debe terminar en ${DOMINIO_DE_LA_SEMILLA}: es el único ` +
        'dominio al que `identidad:sembrar-dev` pone contraseña de desarrollo.',
    );
  }
  if (esAnfitrionLocal(entrada.anfitrion)) return { permitido: true, remoto: false };

  if (entrada.permitirRemoto !== 'si') {
    return negar(
      `Negado: "${entrada.anfitrion}" no es un anfitrión local. Para una base remota de ` +
        'desarrollo, pasa SEMILLA_AGENCIA_PERMITIR_REMOTO=si en la línea de comandos.',
    );
  }
  if (entrada.agenciasAjenas !== 0) {
    return negar(
      `Negado: la base remota "${entrada.anfitrion}" tiene ${entrada.agenciasAjenas} ` +
        `agencia(s) que no son "${SLUG_DE_LA_AGENCIA_DEMO}" ni la que se está sembrando.`,
    );
  }
  if (entrada.identidadesAjenas !== 0) {
    return negar(
      `Negado: la base remota "${entrada.anfitrion}" tiene ${entrada.identidadesAjenas} ` +
        `identidad(es) fuera de ${DOMINIO_DE_LA_SEMILLA}: hay usuarios reales.`,
    );
  }
  return { permitido: true, remoto: true };
}
