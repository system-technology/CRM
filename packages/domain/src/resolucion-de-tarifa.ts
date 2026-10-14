/**
 * Dada una fecha, ¿qué vigencia manda?
 *
 * **Esta es la pieza que hace que ADR-0009 no sea dos modelos disfrazados de uno.** Las agencias
 * que publican salidas con fecha y las que cotizan contra la fecha que elige el cliente pasan las
 * dos por aquí: una salida programada es sencillamente la vigencia de un solo día.
 *
 * **La regla de desempate es una sola: lo más específico gana.**
 *
 * 1. Una **salida publicada** en esa fecha vence a cualquier vigencia abierta que la contenga.
 *    Es lo que permite que el 3 de octubre valga distinto que el resto de la semana sin tocar el
 *    rango general.
 * 2. Entre dos ventanas del mismo tipo, **gana la más corta**. Una promoción de cuatro días dentro
 *    de una temporada de tres meses es más específica que la temporada.
 * 3. Si empatan en tipo y en longitud, **es un error de datos y se devuelve como tal**. No se elige
 *    en silencio: una agencia con dos tarifas solapadas para la misma fecha tiene un problema de
 *    tarifario y merece verlo, no heredar un precio decidido por orden de inserción.
 *
 * Aritmética de fechas pura: no mira el reloj, no toca la base, no sabe de tenants.
 */

import { EstadoInvalidoError, InvariantError } from './errors.js';

/** Lo mínimo que esta función necesita saber de una vigencia. Lo demás viaja con el genérico. */
export interface VentanaDeVigencia {
  /** `AAAA-MM-DD`. */
  readonly desde: string;
  /** `AAAA-MM-DD`. Igual a `desde` cuando es una salida de un día. */
  readonly hasta: string;
  /** Publicada = el cliente la ve como fecha ofrecida. */
  readonly publicada: boolean;
}

export class FechaInvalidaError extends InvariantError {
  readonly code = 'FECHA_INVALIDA';
  constructor(readonly valor: string) {
    super(`'${valor}' no es una fecha AAAA-MM-DD`);
  }
}

export class SinVigenciaError extends EstadoInvalidoError {
  readonly code = 'SIN_VIGENCIA';
  constructor(readonly fecha: string) {
    super(`no hay ninguna vigencia que cubra el ${fecha}`);
  }
}

/** Dos ventanas igual de específicas para la misma fecha: el tarifario está mal cargado. */
export class VigenciasEmpatadasError extends EstadoInvalidoError {
  readonly code = 'VIGENCIAS_EMPATADAS';
  constructor(
    readonly fecha: string,
    readonly empatadas: readonly VentanaDeVigencia[],
  ) {
    super(
      `el ${fecha} cae en ${empatadas.length} vigencias igual de específicas: ` +
        empatadas.map((v) => `${v.desde}..${v.hasta}`).join(', '),
    );
  }
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

function aDiaJuliano(fecha: string): number {
  if (!FORMATO.test(fecha)) throw new FechaInvalidaError(fecha);
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  const instante = Date.UTC(anio, mes - 1, dia);
  // `Date.UTC` acepta el 32 de enero y lo corre a febrero. Un tarifario con «2026-02-31» tiene un
  // error de captura, y vale más devolverlo que cotizar contra una fecha que nadie escribió.
  const normalizada = new Date(instante).toISOString().slice(0, 10);
  if (normalizada !== fecha) throw new FechaInvalidaError(fecha);
  return instante / 86_400_000;
}

/** Cuántos días cubre la ventana, ambos extremos incluidos. Un solo día es 1. */
export function longitudEnDias(ventana: VentanaDeVigencia): number {
  const desde = aDiaJuliano(ventana.desde);
  const hasta = aDiaJuliano(ventana.hasta);
  if (hasta < desde) throw new FechaInvalidaError(`${ventana.desde}..${ventana.hasta}`);
  return hasta - desde + 1;
}

/** Una vigencia publicada de un solo día es lo que el sector llama «salida». */
export function esSalidaProgramada(ventana: VentanaDeVigencia): boolean {
  return ventana.publicada && ventana.desde === ventana.hasta;
}

export function cubre(ventana: VentanaDeVigencia, fecha: string): boolean {
  // `AAAA-MM-DD` ordena igual como texto que como fecha, así que la comparación es directa.
  return ventana.desde <= fecha && fecha <= ventana.hasta;
}

/**
 * La vigencia que manda en esa fecha.
 *
 * Lanza `SinVigenciaError` si ninguna la cubre y `VigenciasEmpatadasError` si dos son igual de
 * específicas.
 */
export function resolverVigencia<T extends VentanaDeVigencia>(
  vigencias: readonly T[],
  fecha: string,
): T {
  aDiaJuliano(fecha);

  const candidatas = vigencias.filter((v) => cubre(v, fecha));
  if (candidatas.length === 0) throw new SinVigenciaError(fecha);

  const puntuadas = candidatas.map((vigencia) => ({
    vigencia,
    // 0 gana a 1: la salida publicada es más específica que cualquier rango que la contenga.
    rango: esSalidaProgramada(vigencia) ? 0 : 1,
    longitud: longitudEnDias(vigencia),
  }));

  puntuadas.sort((a, b) => a.rango - b.rango || a.longitud - b.longitud);

  const mejor = puntuadas[0];
  /* c8 ignore next */
  if (!mejor) throw new SinVigenciaError(fecha);

  const empatadas = puntuadas.filter(
    (p) => p.rango === mejor.rango && p.longitud === mejor.longitud,
  );
  if (empatadas.length > 1) {
    throw new VigenciasEmpatadasError(
      fecha,
      empatadas.map((p) => p.vigencia),
    );
  }

  return mejor.vigencia;
}
