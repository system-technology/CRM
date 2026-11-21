/**
 * Lógica de presentación del dashboard de administración (T-344, ADR-0035 §5 y §6).
 *
 * **Funciones puras, sin red ni React.** La web no decide qué se muestra por permiso propio: pinta
 * lo que la API devolvió. Por eso el margen aparece si y solo si la CLAVE `margen` viene en la fila
 * (`tieneMargen`), no porque la sesión «parezca» tener un permiso.
 *
 * **Dinero (R8):** siempre por moneda, en la unidad mínima y con BigInt. Nada de totales entre
 * monedas ni de conversiones con TRM: por eso el ranking de asesores ordena por **cantidad de
 * ventas cerradas** (un número) y no por un total de dinero.
 *
 * **Muestra (ADR-0035 §5):** el porcentaje solo con `n ≥ 20`; por debajo, la fracción «7 de 15».
 */
import type {
  Dinero,
  FilaDeCobro,
  ResumenDeReportes,
  VentasDeUnaMoneda,
} from '@viajapro/contracts';
import { fechaLocalEnZona } from './reportes-periodo';
import {
  calcularVariacionPorcentual,
  formatearMinutosReporte,
  formatearPorcentajeReporte,
  N_MINIMO_TASA,
} from './reportes-logica';

type Moneda = Dinero['moneda'];

export const TEXTO_SIN_BASE = 'Sin base para comparar';
/** Tope de asesores que se comparan: cada uno es una consulta al servidor (cola T-531). */
export const MAXIMO_ASESORES_COMPARADOS = 12;
/** Ventana de «salidas próximas», en días contando hoy. */
export const DIAS_DE_SALIDAS_PROXIMAS = 30;
/** Una salida con saldo pendiente y a esta distancia o menos se marca en ámbar. */
export const DIAS_DE_SALIDA_CON_SALDO_URGENTE = 15;

// ---------------------------------------------------------------------------------------------
// Muestra: porcentaje o fracción
// ---------------------------------------------------------------------------------------------

export interface TasaPresentada {
  /** Lo que se pinta: «32,5 %» con muestra suficiente o «7 de 15» sin ella. */
  texto: string;
  /** Siempre se ofrece la fracción, para que el porcentaje no esconda de cuántos casos sale. */
  fraccion: string;
  esPorcentaje: boolean;
}

/**
 * `parte` de `total`. Con `total ≥ 20` el porcentaje (el que calculó el servidor) y, aparte, la
 * fracción; por debajo, solo «7 de 15». Sin casos: «Sin casos».
 */
export function presentarTasa(parte: number, total: number, tasa: number | null): TasaPresentada {
  if (total <= 0) return { texto: 'Sin casos', fraccion: 'Sin casos', esPorcentaje: false };
  const fraccion = `${parte} de ${total}`;
  if (total < N_MINIMO_TASA || tasa === null) {
    return { texto: fraccion, fraccion, esPorcentaje: false };
  }
  return { texto: formatearPorcentajeReporte(tasa), fraccion, esPorcentaje: true };
}

/** Minutos de respuesta: con menos de 20 respuestas medidas el p90 es ruido y no se muestra. */
export function presentarP90(p90: number | null | undefined, respondidas: number): string {
  if (p90 === null || p90 === undefined || respondidas <= 0) return '—';
  if (respondidas < N_MINIMO_TASA) return `${respondidas} respuestas: pocas para el p90`;
  return formatearMinutosReporte(p90);
}

// ---------------------------------------------------------------------------------------------
// Ventas por moneda y comparación entre periodos
// ---------------------------------------------------------------------------------------------

export interface FilaDeVentasComparada {
  moneda: Moneda;
  ventas: Dinero;
  cotizacionesAceptadas: number;
  /** Ventas del periodo anterior en la misma moneda; `null` si no hubo ese periodo o esa moneda. */
  anterior: Dinero | null;
  /** Variación porcentual con un decimal; `null` sin base (anterior en cero o sin periodo). */
  variacion: number | null;
  /** `true` solo si la API envió la clave `margen` en esta fila (permiso de margen). */
  tieneMargen: boolean;
  margen: Dinero | null;
  margenPorcentaje: number | null;
  neto: Dinero | null;
  cotizacionesSinNeto: number;
}

function cero(moneda: Moneda): Dinero {
  return { unidades: '0', moneda };
}

/**
 * Una fila por moneda del periodo actual, y también por las monedas que solo vendieron en el
 * anterior (ahí `ventas` es 0: «bajó a cero» es una información, no un hueco).
 */
export function compararVentasPorMoneda(
  actual: readonly VentasDeUnaMoneda[],
  anterior: readonly VentasDeUnaMoneda[] | null,
): FilaDeVentasComparada[] {
  const monedas = new Set<Moneda>(actual.map((f) => f.moneda));
  if (anterior) for (const f of anterior) monedas.add(f.moneda);

  const filas = [...monedas].map((moneda): FilaDeVentasComparada => {
    const a = actual.find((f) => f.moneda === moneda);
    const p = anterior?.find((f) => f.moneda === moneda);
    const ventas = a?.ventas ?? cero(moneda);
    const previo = anterior ? (p?.ventas ?? cero(moneda)) : null;
    return {
      moneda,
      ventas,
      cotizacionesAceptadas: a?.cotizacionesAceptadas ?? 0,
      anterior: previo,
      variacion: previo ? calcularVariacionPorcentual(ventas.unidades, previo.unidades) : null,
      tieneMargen: a !== undefined && 'margen' in a,
      margen: a?.margen ?? null,
      margenPorcentaje: a?.margenPorcentaje ?? null,
      neto: a?.neto ?? null,
      cotizacionesSinNeto: a?.cotizacionesSinNeto ?? 0,
    };
  });
  // Estable y sin mezclar monedas: la más vendida en cantidad de ventas primero, luego por código.
  return filas.sort(
    (x, y) => y.cotizacionesAceptadas - x.cotizacionesAceptadas || x.moneda.localeCompare(y.moneda),
  );
}

export type SentidoDeVariacion = 'sube' | 'baja' | 'igual' | 'sin-base';

export function sentidoDeVariacion(variacion: number | null): SentidoDeVariacion {
  if (variacion === null) return 'sin-base';
  if (variacion > 0) return 'sube';
  if (variacion < 0) return 'baja';
  return 'igual';
}

/** «+12,5 %», «−4,2 %», «Sin cambio» o «Sin base para comparar». Signo menos tipográfico. */
export function textoDeVariacion(variacion: number | null): string {
  if (variacion === null) return TEXTO_SIN_BASE;
  if (variacion === 0) return 'Sin cambio';
  const cifra = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(
    Math.abs(variacion),
  );
  return `${variacion > 0 ? '+' : '−'}${cifra} %`;
}

// ---------------------------------------------------------------------------------------------
// Embudo
// ---------------------------------------------------------------------------------------------

export interface BarraDeEtapa {
  etapaId: string;
  nombre: string;
  cantidad: number;
  esGanada: boolean;
  esPerdida: boolean;
  /** 0–100, relativo a la etapa más poblada: solo dibuja la barra, no es una tasa. */
  anchoPorciento: number;
}

/**
 * Las oportunidades CREADAS en el periodo, por la etapa en que están hoy (contrato). No es un
 * embudo acumulado: no se calcula «paso de una etapa a la siguiente», porque no se puede.
 */
export function barrasDelEmbudo(porEtapa: ResumenDeReportes['oportunidades']['porEtapa']) {
  const ordenadas = [...porEtapa].sort((a, b) => a.orden - b.orden);
  const maximo = Math.max(1, ...ordenadas.map((e) => e.cantidad));
  return ordenadas.map((e): BarraDeEtapa => ({
    etapaId: e.etapaId,
    nombre: e.nombre,
    cantidad: e.cantidad,
    esGanada: e.esGanada,
    esPerdida: e.esPerdida,
    anchoPorciento: e.cantidad === 0 ? 0 : Math.max(3, Math.round((e.cantidad / maximo) * 100)),
  }));
}

// ---------------------------------------------------------------------------------------------
// Asesores
// ---------------------------------------------------------------------------------------------

export interface MiembroParaComparar {
  id: string;
  nombre: string;
}

/** El resumen de un asesor, o `null` si esa consulta falló (la fila se marca, no rompe la tabla). */
export interface ResumenDeAsesor {
  miembro: MiembroParaComparar;
  resumen: ResumenDeReportes | null;
}

export interface FilaDeAsesor {
  id: string;
  nombre: string;
  /** `true` si la consulta de este asesor falló: se pinta «No disponible», no ceros. */
  noDisponible: boolean;
  sinActividad: boolean;
  ventasCerradas: number;
  ventas: Dinero[];
  hayMargen: boolean;
  margenes: Dinero[];
  enviadas: number;
  aceptacion: TasaPresentada;
  ganadas: number;
  conversion: TasaPresentada;
  respondidas: TasaPresentada;
  medianaMinutos: number | null;
}

export function filasDeAsesores(items: readonly ResumenDeAsesor[]): FilaDeAsesor[] {
  const filas = items.map(({ miembro, resumen }): FilaDeAsesor => {
    if (!resumen) {
      return {
        id: miembro.id,
        nombre: miembro.nombre,
        noDisponible: true,
        sinActividad: false,
        ventasCerradas: 0,
        ventas: [],
        hayMargen: false,
        margenes: [],
        enviadas: 0,
        aceptacion: presentarTasa(0, 0, null),
        ganadas: 0,
        conversion: presentarTasa(0, 0, null),
        respondidas: presentarTasa(0, 0, null),
        medianaMinutos: null,
      };
    }
    const { cotizaciones: c, oportunidades: o, respuesta: r } = resumen;
    const cerradas = o.ganadas + o.perdidas;
    return {
      id: miembro.id,
      nombre: miembro.nombre,
      noDisponible: false,
      sinActividad:
        c.creadas === 0 && c.enviadas === 0 && o.creadas === 0 && r.conversacionesNuevas === 0,
      ventasCerradas: c.aceptadas,
      ventas: [...resumen.ventasPorMoneda]
        .sort((x, y) => x.moneda.localeCompare(y.moneda))
        .map((v) => v.ventas),
      hayMargen: resumen.ventasPorMoneda.some((v) => 'margen' in v),
      margenes: resumen.ventasPorMoneda.flatMap((v) => (v.margen ? [v.margen] : [])),
      enviadas: c.enviadas,
      aceptacion: presentarTasa(c.aceptadas, c.enviadas, c.tasaAceptacion),
      ganadas: o.ganadas,
      conversion: presentarTasa(o.ganadas, cerradas, o.tasaConversion),
      respondidas: presentarTasa(
        r.conversacionesRespondidas,
        r.conversacionesNuevas,
        r.tasaRespuesta ?? null,
      ),
      medianaMinutos: r.medianaMinutos,
    };
  });
  // Ranking por ventas cerradas (un número, no dinero: R8). Quien no respondió, al final.
  return filas.sort(
    (a, b) =>
      Number(a.noDisponible) - Number(b.noDisponible) ||
      b.ventasCerradas - a.ventasCerradas ||
      b.enviadas - a.enviadas ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}

// ---------------------------------------------------------------------------------------------
// Cobros, salidas y destinos (de `GET /cobros`: archivos abiertos)
// ---------------------------------------------------------------------------------------------

function sumar(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

function saldoPendiente(f: FilaDeCobro): bigint {
  const s = BigInt(f.saldo.unidades);
  return s > 0n ? s : 0n;
}

export interface CobrosDeUnaMoneda {
  moneda: Moneda;
  archivos: number;
  porCobrar: Dinero;
  vencido: Dinero;
  archivosVencidos: number;
  porVencer: Dinero;
  archivosPorVencer: number;
}

/**
 * Lo que se debe, por moneda: total, lo vencido y lo que vence pronto. Suma saldos positivos ya
 * derivados por el servidor (`saldo = total − pagado`); no recalcula ningún saldo.
 */
export function cobrosPorMoneda(datos: readonly FilaDeCobro[]): CobrosDeUnaMoneda[] {
  const por = new Map<Moneda, CobrosDeUnaMoneda>();
  for (const f of datos) {
    const moneda = f.saldo.moneda;
    const fila = por.get(moneda) ?? {
      moneda,
      archivos: 0,
      porCobrar: cero(moneda),
      vencido: cero(moneda),
      archivosVencidos: 0,
      porVencer: cero(moneda),
      archivosPorVencer: 0,
    };
    const debe = saldoPendiente(f);
    fila.archivos += 1;
    fila.porCobrar = { moneda, unidades: sumar(fila.porCobrar.unidades, debe.toString()) };
    if (debe > 0n && f.estadoDeCobro === 'VENCIDO') {
      fila.vencido = { moneda, unidades: sumar(fila.vencido.unidades, debe.toString()) };
      fila.archivosVencidos += 1;
    }
    if (debe > 0n && f.estadoDeCobro === 'POR_VENCER') {
      fila.porVencer = { moneda, unidades: sumar(fila.porVencer.unidades, debe.toString()) };
      fila.archivosPorVencer += 1;
    }
    por.set(moneda, fila);
  }
  return [...por.values()].sort((a, b) => a.moneda.localeCompare(b.moneda));
}

/** Fecha de hoy `AAAA-MM-DD` en la zona de la agencia (R9). */
export function hoyEnZona(ahora: Date, zona: string): string {
  const { anio, mes, dia } = fechaLocalEnZona(ahora, zona);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round((Date.parse(hastaIso) - Date.parse(desdeIso)) / 86_400_000);
}

export interface SalidaProxima {
  archivoId: string;
  numero: number;
  destino: string;
  fechaSalida: string;
  diasParaSalir: number;
  saldo: Dinero;
  /** Con saldo por cobrar. */
  conSaldo: boolean;
  /** Con saldo y a ≤ 15 días de salir: lo que el administrador no quiere descubrir en el aeropuerto. */
  urgente: boolean;
  estadoDeCobro: FilaDeCobro['estadoDeCobro'];
}

/** Las salidas de los próximos `dias` días (contando hoy), la más cercana primero. */
export function salidasProximas(
  datos: readonly FilaDeCobro[],
  hoyIso: string,
  dias: number = DIAS_DE_SALIDAS_PROXIMAS,
): SalidaProxima[] {
  return datos
    .map((f) => ({ f, d: diasEntre(hoyIso, f.fechaSalida) }))
    .filter(({ d }) => d >= 0 && d < dias)
    .sort((a, b) => a.d - b.d || a.f.numero - b.f.numero)
    .map(({ f, d }): SalidaProxima => {
      const conSaldo = saldoPendiente(f) > 0n;
      return {
        archivoId: f.archivoId,
        numero: f.numero,
        destino: f.destino,
        fechaSalida: f.fechaSalida,
        diasParaSalir: d,
        saldo: { moneda: f.saldo.moneda, unidades: saldoPendiente(f).toString() },
        conSaldo,
        urgente: conSaldo && d <= DIAS_DE_SALIDA_CON_SALDO_URGENTE,
        estadoDeCobro: f.estadoDeCobro,
      };
    });
}

export function textoDeDiasParaSalir(dias: number): string {
  if (dias === 0) return 'Sale hoy';
  if (dias === 1) return 'Sale mañana';
  return `Sale en ${dias} días`;
}

export interface DestinoDeArchivos {
  destino: string;
  archivos: number;
  /** Vendido en esos archivos (venta + ajustes vigentes), por moneda. */
  vendido: Dinero[];
  porCobrar: Dinero[];
}

/**
 * Destinos de los archivos ABIERTOS. No son «ventas del periodo por destino» (eso necesita un campo
 * que la API de reportes aún no trae, cola T-532): es lo vendido en lo que sigue abierto.
 */
export function destinosDeArchivosAbiertos(
  datos: readonly FilaDeCobro[],
  maximo = 6,
): DestinoDeArchivos[] {
  const por = new Map<
    string,
    { nombre: string; archivos: number; vendido: Map<Moneda, string>; debe: Map<Moneda, string> }
  >();
  for (const f of datos) {
    const nombre = f.destino.trim() || 'Sin destino';
    const clave = nombre.toLocaleLowerCase('es');
    const acc = por.get(clave) ?? {
      nombre,
      archivos: 0,
      vendido: new Map<Moneda, string>(),
      debe: new Map<Moneda, string>(),
    };
    acc.archivos += 1;
    const m = f.total.moneda;
    acc.vendido.set(m, sumar(acc.vendido.get(m) ?? '0', f.total.unidades));
    acc.debe.set(m, sumar(acc.debe.get(m) ?? '0', saldoPendiente(f).toString()));
    por.set(clave, acc);
  }
  const aDinero = (mapa: Map<Moneda, string>): Dinero[] =>
    [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moneda, unidades]) => ({ moneda, unidades }));
  return [...por.values()]
    .sort((a, b) => b.archivos - a.archivos || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, maximo)
    .map((d) => ({
      destino: d.nombre,
      archivos: d.archivos,
      vendido: aDinero(d.vendido),
      porCobrar: aDinero(d.debe),
    }));
}
