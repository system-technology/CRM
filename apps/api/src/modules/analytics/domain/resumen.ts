/**
 * El cálculo del resumen de reportes. Puro: recibe agregados ya contados y los convierte en el
 * contrato. Sin framework, sin base de datos.
 *
 * Todo lo que es una razón devuelve `null` cuando no hay base (denominador 0): «0 %» afirmaría
 * que se midió y salió cero.
 */
import type {
  CotizacionesAbiertas,
  PorCobrar,
  ResumenDeReportesPorAlcance,
  SaldoPorCobrarDeUnaMoneda,
  VentasDeUnaMoneda,
} from '@viajapro/contracts';
import { type CodigoMoneda, pagadoNeto, saldoDelArchivo, totalDelArchivo } from '@viajapro/domain';
import type { AlcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import type {
  CobrosAgregados,
  CotizacionesAbiertasAgregadas,
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

/** Las cotizaciones vivas de hoy, tal cual las cuenta la base: aquí solo se suma el total. */
export function cotizacionesAbiertas(a: CotizacionesAbiertasAgregadas): CotizacionesAbiertas {
  return {
    total: a.borradores + a.enviadas,
    borradores: a.borradores,
    enviadas: a.enviadas,
    porAntiguedad: {
      hastaTresDias: a.hastaTresDias,
      deCuatroASiete: a.deCuatroASiete,
      masDeSiete: a.masDeSiete,
    },
  };
}

/**
 * El saldo por cobrar, agrupado por moneda. **La fórmula no se reescribe aquí**: sale de las
 * funciones puras de `packages/domain` (`cobro.ts`), archivo por archivo (ADR-0035 §4).
 *
 * Solo suman los saldos POSITIVOS: un archivo con saldo a favor del viajero no reduce lo que
 * deben los demás, y restarlo haría parecer cobrado lo que no lo está. Las monedas no se mezclan
 * ni se convierten con TRM (R8).
 */
export function porCobrarPorMoneda(cobros: CobrosAgregados): PorCobrar {
  const porMoneda = new Map<CodigoMoneda, { archivos: number; saldo: bigint }>();
  for (const a of cobros.archivos) {
    const total = totalDelArchivo(a.estado, a.ventaUnidades, a.sumas, a.moneda);
    const saldo = saldoDelArchivo(total, pagadoNeto(a.sumas, a.moneda));
    if (saldo.unidades <= 0n) continue;
    const acumulado = porMoneda.get(a.moneda) ?? { archivos: 0, saldo: 0n };
    acumulado.archivos += 1;
    acumulado.saldo += saldo.unidades;
    porMoneda.set(a.moneda, acumulado);
  }
  const filas: SaldoPorCobrarDeUnaMoneda[] = [...porMoneda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, v]) => ({
      moneda,
      archivos: v.archivos,
      saldo: dinero(v.saldo, moneda),
    }));
  return { porMoneda: filas, truncado: cobros.truncado };
}

export function armarResumen(entrada: {
  alcance: AlcanceDeReporte;
  rango: RangoDeReporte;
  cotizaciones: CotizacionesAgregadas;
  etapas: EtapaConOportunidades[];
  respuesta: RespuestaAgregada;
  abiertas: CotizacionesAbiertasAgregadas;
  cobros: CobrosAgregados;
}): ResumenDeReportesPorAlcance {
  const { alcance, rango, cotizaciones: c, etapas, respuesta, abiertas, cobros } = entrada;

  const porEtapa = etapas.slice().sort((a, b) => a.orden - b.orden);
  const suma = (f: (e: EtapaConOportunidades) => boolean): number =>
    porEtapa.filter(f).reduce((s, e) => s + e.cantidad, 0);
  const ganadas = suma((e) => e.esGanada);
  const perdidas = suma((e) => e.esPerdida);
  const creadas = suma(() => true);

  // El alcance y el asesor efectivos van en la respuesta para que la web titule con la verdad y
  // no los deduzca de los permisos (ADR-0035 §4). Las dos ramas se construyen por separado: la
  // unión discriminada del contrato es lo que impide que una clave de agencia caiga en la propia.
  const cifras = {
    periodo: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString() },
    cotizaciones: {
      creadas: c.creadas,
      enviadas: c.enviadas,
      aceptadas: c.aceptadas,
      ...(c.aceptadasSinFecha > 0 ? { aceptadasSinFecha: c.aceptadasSinFecha } : {}),
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
      p90Minutos: respuesta.p90Minutos,
      sinResponder: respuesta.sinResponder,
      tasaRespuesta: porcentaje(
        respuesta.conversacionesRespondidas,
        respuesta.conversacionesNuevas,
      ),
    },
    // T-528. Las dos son de HOY, no del periodo, y las componen las mismas filas que el alcance
    // decide para el resto: con `PROPIO`, solo las del asesor de la sesión.
    cotizacionesAbiertas: cotizacionesAbiertas(abiertas),
    porCobrar: porCobrarPorMoneda(cobros),
  };

  return alcance.nivel === 'PROPIO'
    ? { alcance: 'PROPIO', asesorId: alcance.asesorId, ...cifras }
    : { alcance: 'AGENCIA', asesorId: alcance.asesorId, ...cifras };
}
