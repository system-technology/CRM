/**
 * Presentación del `ResumenDeReportes` del servidor (lógica pura, sin cálculo de negocio).
 *
 * Reglas:
 *  - Una fila por moneda: NUNCA se suman monedas distintas (R8).
 *  - `Dinero.unidades` es texto en la unidad mínima; las variaciones se calculan con BigInt.
 *  - Una razón o promedio `null` se muestra «Aún sin datos», jamás 0.
 *  - Neto y margen existen solo si la clave viene en la fila: sin permiso no hay clave,
 *    y la web no la reconstruye (ADR-0011).
 */
import type { Dinero, ResumenDeReportes } from '@viajapro/contracts';

export const TEXTO_SIN_DATOS = 'Aún sin datos';

/** «12,5 %» / «Aún sin datos». Las tasas del contrato vienen en porcentaje con un decimal. */
export function textoPorcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return TEXTO_SIN_DATOS;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(valor)} %`;
}

/** «4,5 min» / «Aún sin datos». */
export function textoMinutos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return TEXTO_SIN_DATOS;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(valor)} min`;
}

/**
 * Variación porcentual (1 decimal) entre dos importes en la unidad mínima.
 * `null` si el anterior no es positivo: sin base no hay variación (no se inventa +100 %).
 */
export function variacionDeImportes(actual: string, anterior: string): number | null {
  const a = BigInt(actual);
  const b = BigInt(anterior);
  if (b <= 0n) return null;
  // Décimas de punto porcentual en enteros, con redondeo half-up sobre el valor absoluto.
  const delta = (a - b) * 1000n;
  const signo = delta < 0n ? -1n : 1n;
  const abs = delta < 0n ? -delta : delta;
  const decimas = signo * ((abs + b / 2n) / b);
  return Number(decimas) / 10;
}

export interface FilaDeVentas {
  moneda: string;
  ventas: Dinero;
  cotizacionesAceptadas: number;
  /** Variación contra el periodo anterior en la MISMA moneda; `null` si no hay base. */
  variacionPorcentaje: number | null;
  /** Presente solo si la respuesta trae las claves (permiso `cotizacion.ver_neto_y_margen`). */
  confidencial?: {
    neto: Dinero | null;
    margen: Dinero | null;
    margenPorcentaje: number | null;
    cotizacionesSinNeto: number;
  };
}

export interface VistaDeResumen {
  filasDeVentas: FilaDeVentas[];
  /** `true` si alguna fila trae neto/margen (el servidor decidió entregarlos). */
  hayConfidencial: boolean;
  /** Cotizaciones: textos de razón ya resueltos. */
  tasaAceptacion: string;
  tasaConversion: string;
  promedioRespuesta: string;
  medianaRespuesta: string;
}

export function prepararResumen(
  actual: ResumenDeReportes,
  anterior: ResumenDeReportes | null,
): VistaDeResumen {
  const filasDeVentas: FilaDeVentas[] = actual.ventasPorMoneda.map((fila) => {
    const previa = anterior?.ventasPorMoneda.find((f) => f.moneda === fila.moneda);
    const base: FilaDeVentas = {
      moneda: fila.moneda,
      ventas: fila.ventas,
      cotizacionesAceptadas: fila.cotizacionesAceptadas,
      variacionPorcentaje: previa
        ? variacionDeImportes(fila.ventas.unidades, previa.ventas.unidades)
        : null,
    };
    const traeConfidencial =
      'neto' in fila ||
      'margen' in fila ||
      'margenPorcentaje' in fila ||
      'cotizacionesSinNeto' in fila;
    if (traeConfidencial) {
      base.confidencial = {
        neto: fila.neto ?? null,
        margen: fila.margen ?? null,
        margenPorcentaje: fila.margenPorcentaje ?? null,
        cotizacionesSinNeto: fila.cotizacionesSinNeto ?? 0,
      };
    }
    return base;
  });

  return {
    filasDeVentas,
    hayConfidencial: filasDeVentas.some((f) => f.confidencial !== undefined),
    tasaAceptacion: textoPorcentaje(actual.cotizaciones.tasaAceptacion),
    tasaConversion: textoPorcentaje(actual.oportunidades.tasaConversion),
    promedioRespuesta: textoMinutos(actual.respuesta.promedioMinutos),
    medianaRespuesta: textoMinutos(actual.respuesta.medianaMinutos),
  };
}
