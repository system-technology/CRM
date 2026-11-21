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
  VentasDeUnDestino,
  VentasDeUnaMoneda,
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
  VentaPorDestinoAgregada,
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

/** Una fila por destino y moneda (T-532): la de `ventasPorMoneda` más el destino. */
export function ventasDeUnDestino(v: VentaPorDestinoAgregada): VentasDeUnDestino {
  return { destino: v.destino, ...ventasDeUnaMoneda(v) };
}

const SIN_COTIZACIONES = { creadas: 0, enviadas: 0, aceptadas: 0, aceptadasSinFecha: 0 } as const;
const SIN_RESPUESTA = {
  conversacionesNuevas: 0,
  conversacionesRespondidas: 0,
  promedioMinutos: null,
  medianaMinutos: null,
  p90Minutos: null,
  sinResponder: 0,
} as const;

/** Las cifras de cotizaciones y de respuesta de un grupo, en la forma del contrato. */
function cotizacionesDelContrato(c: Omit<CotizacionesAgregadas, 'ventasPorMoneda'>) {
  return {
    creadas: c.creadas,
    enviadas: c.enviadas,
    aceptadas: c.aceptadas,
    ...(c.aceptadasSinFecha > 0 ? { aceptadasSinFecha: c.aceptadasSinFecha } : {}),
    tasaAceptacion: porcentaje(c.aceptadas, c.enviadas),
  };
}

function respuestaDelContrato(r: RespuestaAgregada) {
  return {
    conversacionesNuevas: r.conversacionesNuevas,
    conversacionesRespondidas: r.conversacionesRespondidas,
    promedioMinutos: r.promedioMinutos,
    medianaMinutos: r.medianaMinutos,
    p90Minutos: r.p90Minutos,
    sinResponder: r.sinResponder,
    tasaRespuesta: porcentaje(r.conversacionesRespondidas, r.conversacionesNuevas),
  };
}

/**
 * T-531: une los tres agregados por asesor en una fila por asesor. Un asesor aparece si tiene algo
 * atribuido en CUALQUIERA de los tres; lo que no tiene en uno es cero (y las razones, `null`), con
 * las mismas fórmulas que el resumen entero: es lo que traería esa consulta filtrada por él.
 * Orden por `asesorId`, para que la respuesta no dependa del plan de la base.
 */
export function resumenesPorAsesor(entrada: {
  cotizaciones: CotizacionesDeUnAsesor[];
  oportunidades: OportunidadesDeUnAsesor[];
  respuestas: RespuestaDeUnAsesor[];
}): ResumenDeUnAsesor[] {
  const cot = new Map(entrada.cotizaciones.map((c) => [c.asesorId, c]));
  const opo = new Map(entrada.oportunidades.map((o) => [o.asesorId, o]));
  const res = new Map(entrada.respuestas.map((r) => [r.asesorId, r]));
  const ids = [...new Set([...cot.keys(), ...opo.keys(), ...res.keys()])].sort();

  return ids.map((asesorId) => {
    const c = cot.get(asesorId);
    const o = opo.get(asesorId) ?? { asesorId, creadas: 0, ganadas: 0, perdidas: 0 };
    const r = res.get(asesorId);
    return {
      asesorId,
      cotizaciones: cotizacionesDelContrato(c ?? SIN_COTIZACIONES),
      ventasPorMoneda: (c?.ventasPorMoneda ?? []).map(ventasDeUnaMoneda),
      oportunidades: {
        creadas: o.creadas,
        ganadas: o.ganadas,
        perdidas: o.perdidas,
        abiertas: o.creadas - o.ganadas - o.perdidas,
        tasaConversion: porcentaje(o.ganadas, o.ganadas + o.perdidas),
      },
      respuesta: respuestaDelContrato(r ?? SIN_RESPUESTA),
    };
  });
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
  /**
   * **Ausente cuando el usuario no tiene `cobro.ver`** (T-537): sin el permiso el caso de uso ni
   * siquiera consulta el puerto, igual que con el margen, y aquí la clave `porCobrar` no se
   * construye. No es cero ni `null`: lo que no se puede ver, no existe en la respuesta.
   */
  cobros: CobrosAgregados | undefined;
  /**
   * Solo del alcance de agencia (T-531, T-532). Con alcance propio se ignoran: la unión
   * discriminada del contrato tampoco las admite, así que no hay forma de que lleguen a una
   * respuesta propia.
   */
  agencia?: {
    porAsesor?: ResumenDeUnAsesor[] | undefined;
    ventasPorDestino?: VentaPorDestinoAgregada[] | undefined;
  };
}): ResumenDeReportesPorAlcance {
  const { alcance, rango, cotizaciones: c, etapas, respuesta, abiertas, cobros, agencia } = entrada;

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
    cotizaciones: cotizacionesDelContrato(c),
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
    respuesta: respuestaDelContrato(respuesta),
    // T-528. Las dos son de HOY, no del periodo, y las componen las mismas filas que el alcance
    // decide para el resto: con `PROPIO`, solo las del asesor de la sesión.
    cotizacionesAbiertas: cotizacionesAbiertas(abiertas),
    // T-537: `porCobrar` solo existe con `cobro.ver`. Alcance y permiso son ejes distintos, como
    // con el margen: el alcance decide QUÉ FILAS, el permiso SI LA CIFRA EXISTE.
    ...(cobros === undefined ? {} : { porCobrar: porCobrarPorMoneda(cobros) }),
  };

  return alcance.nivel === 'PROPIO'
    ? { alcance: 'PROPIO', asesorId: alcance.asesorId, ...cifras }
    : {
        alcance: 'AGENCIA',
        asesorId: alcance.asesorId,
        ...cifras,
        ...(agencia?.porAsesor === undefined ? {} : { porAsesor: agencia.porAsesor }),
        ...(agencia?.ventasPorDestino === undefined
          ? {}
          : { ventasPorDestino: agencia.ventasPorDestino.map(ventasDeUnDestino) }),
      };
}
