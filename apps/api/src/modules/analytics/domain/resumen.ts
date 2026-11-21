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
  ResumenDeUnAsesor,
  SaldoPorCobrarDeUnaMoneda,
  VentasDeUnaMoneda,
  VentasDeUnDestino,
} from '@viajapro/contracts';
import { type CodigoMoneda, pagadoNeto, saldoDelArchivo, totalDelArchivo } from '@viajapro/domain';
import type { AlcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import type {
  CobrosAgregados,
  CotizacionesAbiertasAgregadas,
  CotizacionesAgregadas,
  CotizacionesDeUnAsesor,
  EtapaConOportunidades,
  OportunidadesDeUnAsesor,
  RangoDeReporte,
  RespuestaAgregada,
  RespuestaDeUnAsesor,
  VentaAgregada,
  VentaDeUnDestino,
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

/** Lo que el alcance de agencia añade al resumen: las cifras partidas (T-531, T-532). */
export interface DesgloseDeAgencia {
  cotizacionesPorAsesor: CotizacionesDeUnAsesor[];
  oportunidadesPorAsesor: OportunidadesDeUnAsesor[];
  respuestaPorAsesor: RespuestaDeUnAsesor[];
  ventasPorDestino: VentaDeUnDestino[];
}

/** Las ventas de un destino y una moneda: la fila de `ventasDeUnaMoneda`, con su destino. */
export function ventasDeUnDestino(v: VentaDeUnDestino): VentasDeUnDestino {
  return { destino: v.destino, ...ventasDeUnaMoneda(v) };
}

/**
 * Una fila por asesor (T-531), uniendo las TRES fuentes: quien solo tiene oportunidades, o solo
 * conversaciones, aparece igual. Lo que una fuente no trae son ceros con razones `null`, no cifras
 * inventadas. Orden estable: por `asesorId`, y la fila «sin asignar» (`null`) al final.
 *
 * La misma aritmética que el total (`porcentaje`, `ventasDeUnaMoneda`): las filas suman lo que el
 * total de la agencia, que es lo que prueba el e2e. Las claves de margen siguen viniendo —o no— de
 * los agregados (que las trae el puerto solo con permiso); aquí no se rellenan nunca.
 */
export function armarPorAsesor(
  entrada: Pick<
    DesgloseDeAgencia,
    'cotizacionesPorAsesor' | 'oportunidadesPorAsesor' | 'respuestaPorAsesor'
  >,
): ResumenDeUnAsesor[] {
  const ids = new Set<string | null>();
  for (const f of entrada.cotizacionesPorAsesor) ids.add(f.asesorId);
  for (const f of entrada.oportunidadesPorAsesor) ids.add(f.asesorId);
  for (const f of entrada.respuestaPorAsesor) ids.add(f.asesorId);

  const cotizaciones = new Map(entrada.cotizacionesPorAsesor.map((f) => [f.asesorId, f]));
  const oportunidades = new Map(entrada.oportunidadesPorAsesor.map((f) => [f.asesorId, f]));
  const respuestas = new Map(entrada.respuestaPorAsesor.map((f) => [f.asesorId, f]));

  const ordenados = [...ids].sort((a, b) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  });

  return ordenados.map((asesorId) => {
    const c = cotizaciones.get(asesorId);
    const o = oportunidades.get(asesorId);
    const r = respuestas.get(asesorId);
    const ganadas = o?.ganadas ?? 0;
    const perdidas = o?.perdidas ?? 0;
    const creadas = o?.creadas ?? 0;
    const nuevas = r?.conversacionesNuevas ?? 0;
    const respondidas = r?.conversacionesRespondidas ?? 0;
    return {
      asesorId,
      cotizaciones: {
        creadas: c?.creadas ?? 0,
        enviadas: c?.enviadas ?? 0,
        aceptadas: c?.aceptadas ?? 0,
        ...((c?.aceptadasSinFecha ?? 0) > 0 ? { aceptadasSinFecha: c?.aceptadasSinFecha } : {}),
        tasaAceptacion: porcentaje(c?.aceptadas ?? 0, c?.enviadas ?? 0),
      },
      ventasPorMoneda: (c?.ventasPorMoneda ?? []).map(ventasDeUnaMoneda),
      oportunidades: {
        creadas,
        ganadas,
        perdidas,
        abiertas: creadas - ganadas - perdidas,
        tasaConversion: porcentaje(ganadas, ganadas + perdidas),
      },
      respuesta: {
        conversacionesNuevas: nuevas,
        conversacionesRespondidas: respondidas,
        promedioMinutos: r?.promedioMinutos ?? null,
        medianaMinutos: r?.medianaMinutos ?? null,
        p90Minutos: r?.p90Minutos ?? null,
        sinResponder: r?.sinResponder ?? 0,
        tasaRespuesta: porcentaje(respondidas, nuevas),
      },
    };
  });
}

export function armarResumen(entrada: {
  alcance: AlcanceDeReporte;
  rango: RangoDeReporte;
  cotizaciones: CotizacionesAgregadas;
  etapas: EtapaConOportunidades[];
  respuesta: RespuestaAgregada;
  abiertas: CotizacionesAbiertasAgregadas;
  /**
   * **Ausente cuando el usuario no tiene `cobro.ver`** (T-537): sin el permiso el caso de uso ni
   * siquiera consulta el puerto, igual que con el margen, y aquí la clave `porCobrar` no se
   * construye. No es cero ni `null`: lo que no se puede ver, no existe en la respuesta.
   */
  cobros: CobrosAgregados | undefined;
  /**
   * Solo con alcance de AGENCIA (T-531, T-532). Con `PROPIO` el caso de uso ni lo consulta, y aquí
   * se ignora aunque llegara: la rama propia del contrato es `strict()` y no tiene esas claves.
   */
  desglose?: DesgloseDeAgencia | undefined;
}): ResumenDeReportesPorAlcance {
  const {
    alcance,
    rango,
    cotizaciones: c,
    etapas,
    respuesta,
    abiertas,
    cobros,
    desglose,
  } = entrada;

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
    // T-537: `porCobrar` solo existe con `cobro.ver`. Alcance y permiso son ejes distintos, como
    // con el margen: el alcance decide QUÉ FILAS, el permiso SI LA CIFRA EXISTE.
    ...(cobros === undefined ? {} : { porCobrar: porCobrarPorMoneda(cobros) }),
  };

  if (alcance.nivel === 'PROPIO') {
    return { alcance: 'PROPIO', asesorId: alcance.asesorId, ...cifras };
  }
  return {
    alcance: 'AGENCIA',
    asesorId: alcance.asesorId,
    ...cifras,
    ...(desglose === undefined
      ? {}
      : {
          porAsesor: armarPorAsesor(desglose),
          ventasPorDestino: desglose.ventasPorDestino.map(ventasDeUnDestino),
        }),
  };
}
