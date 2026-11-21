/**
 * Decisión PURA de si `semilla-agencia-desde-json` puede sembrar una agencia de prospecto.
 *
 * Mismo patrón que `apps/api/src/modules/identity/scripts/guardia-de-siembra-dev.ts` y
 * `inbox/scripts/guardia-de-canal-de-prueba.ts` (no se importan de ahí: `packages/database` no
 * depende de `apps/api`; las constantes se repiten a propósito y son tres líneas). La intención:
 * jamás sembrar datos de un tercero ni crear identidades de desarrollo donde hay agencias o
 * usuarios reales. Los motivos nunca incluyen cadenas de conexión, rutas, correos ni valores del
 * catálogo: solo nombres de variable y conteos.
 *
 * Y la guarda (c) de la precondición dura de ADR-0031 §4: mientras el índice de apodos de
 * `accesos_identidad` sea GLOBAL, no se siembra una SEGUNDA agencia (ver `elIndiceDeApodosEsGlobal`,
 * al final). `crear_agencia` aplica la misma regla en la base (migración 20261120160000).
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
  /**
   * Agencias (filas de `tenants`, también la demo) cuyo slug NO es el de la que se siembra. Se
   * cuenta en local y en remoto: la precondición de ADR-0031 §4 no distingue.
   */
  readonly otrasAgencias: number;
  /** Resultado de `elIndiceDeApodosEsGlobal` sobre la lectura del catálogo. */
  readonly indiceDeApodosGlobal: boolean;
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
  // ADR-0031 §4, precondición dura (B3), guarda (c): con el índice de apodos global no nace una
  // SEGUNDA agencia, tampoco por script. Volver a sembrar la misma (mismo slug) sí se permite.
  if (entrada.indiceDeApodosGlobal && entrada.otrasAgencias !== 0) {
    return negar(
      `Negado: la base ya tiene ${entrada.otrasAgencias} agencia(s) distinta(s) de la que se ` +
        'siembra y el índice de apodos de accesos_identidad es global (ADR-0031 §4, fase 1). ' +
        'Una segunda agencia exige antes la fase 2 (índice por agencia).',
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

// =============================================================================================
// ¿Es GLOBAL el índice de apodos? (ADR-0031 §4, «Cómo se detecta que el índice es global»)
//
// La misma regla que la guarda de `crear_agencia` (migración 20261120160000), leída del CATÁLOGO
// (`pg_index`, `pg_attribute`: legibles por cualquier rol) y decidida aquí, en una función pura que
// se prueba sin base. Global si:
//   · falta la columna `apodo` o la `tenant_acceso_id` de `accesos_identidad`;
//   · un índice único (o de exclusión) tiene `apodo` entre sus columnas CLAVE y no
//     `tenant_acceso_id` (las de INCLUDE no cuentan; válido o no: uno a medio construir ya impone la
//     unicidad a las filas nuevas);
//   · un índice de expresión o parcial toca `apodo` (por columna o porque su expresión o su
//     predicado lo nombran).
// Se compara por columnas, nunca por el nombre del índice. Una lectura que no tiene la forma
// esperada, o que falla, cuenta como global: la guarda falla cerrada.
// =============================================================================================

/**
 * Lee el catálogo. Una fila: si existen las dos columnas y, por cada índice de
 * `public.accesos_identidad`, sus columnas clave, todas sus columnas, su expresión y su predicado.
 * El `::regclass` aborta si la tabla no existe (quien llama lo trata como global). Sin parámetros.
 */
export const CONSULTA_DEL_INDICE_DE_APODOS = `
  SELECT
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = 'public.accesos_identidad'::pg_catalog.regclass
               AND a.attname = 'apodo' AND a.attnum > 0 AND NOT a.attisdropped) AS "hayApodo",
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = 'public.accesos_identidad'::pg_catalog.regclass
               AND a.attname = 'tenant_acceso_id' AND a.attnum > 0 AND NOT a.attisdropped)
      AS "hayTenantAcceso",
    COALESCE((
      SELECT pg_catalog.json_agg(pg_catalog.json_build_object(
               'unico', i.indisunique OR i.indisexclusion,
               'claves', ARRAY(
                 SELECT a.attname::pg_catalog.text
                   FROM pg_catalog.unnest(i.indkey::pg_catalog.int2[]) WITH ORDINALITY AS k(attnum, n)
                   JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                  WHERE k.n <= i.indnkeyatts
                  ORDER BY k.n),
               'columnas', ARRAY(
                 SELECT a.attname::pg_catalog.text
                   FROM pg_catalog.unnest(i.indkey::pg_catalog.int2[]) WITH ORDINALITY AS k(attnum, n)
                   JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                  ORDER BY k.n),
               'expresion', pg_catalog.pg_get_expr(i.indexprs, i.indrelid),
               'predicado', pg_catalog.pg_get_expr(i.indpred, i.indrelid)))
        FROM pg_catalog.pg_index i
       WHERE i.indrelid = 'public.accesos_identidad'::pg_catalog.regclass
    ), '[]'::pg_catalog.json) AS "indices"
`;

const NOMBRA_APODO = /(^|[^A-Za-z0-9_])apodo($|[^A-Za-z0-9_])/;

function nombraApodo(texto: unknown): boolean {
  return typeof texto === 'string' && NOMBRA_APODO.test(texto);
}

function esListaDeTextos(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.every((v) => typeof v === 'string');
}

/**
 * Decide sobre la fila que devuelve `CONSULTA_DEL_INDICE_DE_APODOS`. Todo lo que no tenga la forma
 * esperada (incluido `undefined` si la consulta no devolvió fila) da `true`: global, cerrado.
 */
export function elIndiceDeApodosEsGlobal(lectura: unknown): boolean {
  if (typeof lectura !== 'object' || lectura === null) return true;
  const { hayApodo, hayTenantAcceso, indices } = lectura as Record<string, unknown>;
  if (hayApodo !== true || hayTenantAcceso !== true) return true;
  if (!Array.isArray(indices)) return true;
  for (const indice of indices as unknown[]) {
    if (typeof indice !== 'object' || indice === null) return true;
    const { unico, claves, columnas, expresion, predicado } = indice as Record<string, unknown>;
    const textoONulo = (v: unknown): boolean => v === null || typeof v === 'string';
    if (
      typeof unico !== 'boolean' ||
      !esListaDeTextos(claves) ||
      !esListaDeTextos(columnas) ||
      !textoONulo(expresion) ||
      !textoONulo(predicado)
    ) {
      return true;
    }
    if (unico && claves.includes('apodo') && !claves.includes('tenant_acceso_id')) return true;
    const deExpresionOParcial = expresion !== null || predicado !== null;
    if (
      deExpresionOParcial &&
      (columnas.includes('apodo') || nombraApodo(expresion) || nombraApodo(predicado))
    ) {
      return true;
    }
  }
  return false;
}
