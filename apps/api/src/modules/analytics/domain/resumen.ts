/**
 * El cálculo del resumen de reportes. Puro: recibe agregados ya contados y los convierte en el
 * contrato. Sin framework, sin base de datos.
 *
 * Todo lo que es una razón devuelve `null` cuando no hay base (denominador 0): «0 %» afirmaría
 * que se midió y salió cero.
 */
import type { ResumenDeReportes, VentasDeUnaMoneda } from '@viajapro/contracts';
import type {
  CotizacionesAgregadas,
  EtapaConOportunidades,
  RangoDeReporte,
  RespuestaAgregada,
  VentaAgregada,
} from '../../../shared/puertos/puertos-de-reportes.js';

/** Porcentaje con un decimal, redondeado al más cercano. `null` sin denominador. */
export function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

/**
 * Margen sobre venta, en porcentaje con un decimal, con aritmética entera: una venta en pesos
 * supera el entero seguro de JS (R8). `null` sin base de venta.
 */
export function porcentajeDeMargen(margen: bigint, ventaConNeto: bigint): number | null {
  if (ventaConNeto <= 0n) return null;
  // Décimas de punto, redondeo half-away-from-zero.
  const numerador = margen * 1000n;
  const medio = ventaConNeto / 2n;
  const q = (numerador >= 0n ? numerador + medio : numerador - medio) / ventaConNeto;
  return Number(q) / 10;
}

const dinero = (unidades: bigint, moneda: VentaAgregada['moneda']) => ({
  unidades: unidades.toString(),
  moneda,
});

/**
 * Una fila por moneda. Las claves de margen se AÑADEN solo si el agregado las trae: quien decide
 * si existen es el caso de uso (por el permiso), y aquí no se rellenan ni con cero ni con `null`.
 */
export function ventasDeUnaMoneda(v: VentaAgregada): VentasDeUnaMoneda {
  const fila: VentasDeUnaMoneda = {
    moneda: v.moneda,
    cotizacionesAceptadas: v.cotizacionesAceptadas,
    ventas: dinero(v.ventaUnidades, v.moneda),
  };
  if (v.margen) {
    fila.neto = v.margen.netoUnidades === null ? null : dinero(v.margen.netoUnidades, v.moneda);
    fila.margen =
      v.margen.margenUnidades === null ? null : dinero(v.margen.margenUnidades, v.moneda);
    fila.margenPorcentaje =
      v.margen.margenUnidades === null
        ? null
        : porcentajeDeMargen(v.margen.margenUnidades, v.margen.ventaConNetoUnidades);
    fila.cotizacionesSinNeto = v.margen.cotizacionesSinNeto;
  }
  return fila;
}

export function armarResumen(entrada: {
  rango: RangoDeReporte;
  cotizaciones: CotizacionesAgregadas;
  etapas: EtapaConOportunidades[];
  respuesta: RespuestaAgregada;
}): ResumenDeReportes {
  const { rango, cotizaciones: c, etapas, respuesta } = entrada;

  const porEtapa = etapas.slice().sort((a, b) => a.orden - b.orden);
  const suma = (f: (e: EtapaConOportunidades) => boolean): number =>
    porEtapa.filter(f).reduce((s, e) => s + e.cantidad, 0);
  const ganadas = suma((e) => e.esGanada);
  const perdidas = suma((e) => e.esPerdida);
  const creadas = suma(() => true);

  return {
    periodo: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    cotizaciones: {
      creadas: c.creadas,
      enviadas: c.enviadas,
      aceptadas: c.aceptadas,
      tasaAceptacion: porcentaje(c.aceptadas, c.enviadas),
    },
    ventasPorMoneda: c.ventasPorMoneda.map(ventasDeUnaMoneda),
    oportunidades: {
      creadas,
      ganadas,
      perdidas,
      abiertas: creadas - ganadas - perdidas,
      tasaConversion: porcentaje(ganadas, ganadas + perdidas),
      porEtapa: porEtapa.map((e) => ({
        etapaId: e.etapaId,
        nombre: e.nombre,
        orden: e.orden,
        esGanada: e.esGanada,
        esPerdida: e.esPerdida,
        cantidad: e.cantidad,
      })),
    },
    respuesta: {
      conversacionesNuevas: respuesta.conversacionesNuevas,
      conversacionesRespondidas: respuesta.conversacionesRespondidas,
      promedioMinutos: respuesta.promedioMinutos,
      medianaMinutos: respuesta.medianaMinutos,
    },
  };
}
