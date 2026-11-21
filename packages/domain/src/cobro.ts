/**
 * Cobro del viajero: saldo, situación y estado de cobro de un archivo de viaje (ADR-0034 §3).
 *
 * Funciones PURAS sobre enteros `bigint` (R8): solo sumas y restas en la misma moneda, sin
 * redondeo, sin `number` para dinero y sin reloj (el «hoy» entra como argumento, ya en la zona
 * horaria de la agencia, R9). Nada de esto es columna: se calcula en cada lectura.
 *
 *   vigente = movimiento (que no es un REVERSO) sin un REVERSO que lo apunte
 *   pagado  = Σ PAGO vigentes − Σ DEVOLUCION vigentes
 *   total   = archivo ABIERTO:   venta + Σ AJUSTE vigentes
 *             archivo CANCELADO: Σ PENALIDAD vigentes
 *   saldo   = total − pagado
 */

import { InvariantError } from './errors.js';
import { type CodigoMoneda, Money } from './money.js';

export const TIPOS_DE_MOVIMIENTO_DE_COBRO = [
  'PAGO',
  'DEVOLUCION',
  'AJUSTE',
  'PENALIDAD',
  'REVERSO',
] as const;
export type TipoDeMovimientoDeCobro = (typeof TIPOS_DE_MOVIMIENTO_DE_COBRO)[number];

export type EstadoDelArchivoParaCobro = 'ABIERTO' | 'CANCELADO';

/** Lo mínimo de un movimiento para calcular el saldo. */
export interface MovimientoParaSaldo {
  id: string;
  tipo: TipoDeMovimientoDeCobro;
  /** Con signo: negativo solo en un AJUSTE (descuento) y en el REVERSO que lo copia. */
  montoUnidades: bigint;
  /** Solo y siempre en un REVERSO: el movimiento que anula. */
  reversoDeId: string | null;
}

/** Las sumas de los movimientos VIGENTES por tipo, en la unidad mínima. */
export interface SumasDeCobro {
  pagos: bigint;
  devoluciones: bigint;
  ajustes: bigint;
  penalidades: bigint;
}

export const SUMAS_EN_CERO: SumasDeCobro = {
  pagos: 0n,
  devoluciones: 0n,
  ajustes: 0n,
  penalidades: 0n,
};

/** Los ids que algún REVERSO anula. */
export function idsReversados(movimientos: readonly MovimientoParaSaldo[]): Set<string> {
  const ids = new Set<string>();
  for (const m of movimientos) {
    if (m.tipo === 'REVERSO' && m.reversoDeId !== null) ids.add(m.reversoDeId);
  }
  return ids;
}

/** Vigente: ni es un REVERSO (no mueve dinero) ni lo anula un REVERSO. */
export function esVigente(m: MovimientoParaSaldo, reversados: ReadonlySet<string>): boolean {
  return m.tipo !== 'REVERSO' && !reversados.has(m.id);
}

/** Suma de los movimientos vigentes, por tipo, como `bigint` (nunca `number`). */
export function sumasVigentes(movimientos: readonly MovimientoParaSaldo[]): SumasDeCobro {
  const reversados = idsReversados(movimientos);
  let pagos = 0n;
  let devoluciones = 0n;
  let ajustes = 0n;
  let penalidades = 0n;
  for (const m of movimientos) {
    if (!esVigente(m, reversados)) continue;
    if (m.tipo === 'PAGO') pagos += m.montoUnidades;
    else if (m.tipo === 'DEVOLUCION') devoluciones += m.montoUnidades;
    else if (m.tipo === 'AJUSTE') ajustes += m.montoUnidades;
    else if (m.tipo === 'PENALIDAD') penalidades += m.montoUnidades;
  }
  return { pagos, devoluciones, ajustes, penalidades };
}

/** Lo pagado por el viajero y no devuelto. */
export function pagadoNeto(sumas: SumasDeCobro, moneda: CodigoMoneda): Money {
  return Money.desdeUnidades(sumas.pagos - sumas.devoluciones, moneda);
}

/**
 * Lo que el viajero debe en total. En un archivo cancelado la venta y sus ajustes dejan de
 * exigirse: solo cuenta lo que la agencia retiene (penalidades).
 */
export function totalDelArchivo(
  estado: EstadoDelArchivoParaCobro,
  ventaUnidades: bigint,
  sumas: SumasDeCobro,
  moneda: CodigoMoneda,
): Money {
  return Money.desdeUnidades(
    estado === 'ABIERTO' ? ventaUnidades + sumas.ajustes : sumas.penalidades,
    moneda,
  );
}

/** `total − pagado`: positivo = el viajero debe; negativo = saldo a favor. */
export function saldoDelArchivo(total: Money, pagado: Money): Money {
  return total.restar(pagado);
}

export type SituacionDelSaldo = 'SIN_PAGOS' | 'PARCIAL' | 'PAGADO' | 'SALDO_A_FAVOR';

/**
 * Cuánto se ha cubierto (ADR-0034 §3):
 *
 *   SIN_PAGOS      pagado = 0 y total > 0   (aquí `pagado ≤ 0`: un pagado negativo es imposible
 *                                            por las reglas de registro, y nunca es «parcial»)
 *   PARCIAL        0 < pagado < total
 *   PAGADO         saldo = 0
 *   SALDO_A_FAVOR  saldo < 0
 */
export function situacionDelSaldo(total: Money, pagado: Money): SituacionDelSaldo {
  const saldo = saldoDelArchivo(total, pagado).unidades;
  if (saldo === 0n) return 'PAGADO';
  if (saldo < 0n) return 'SALDO_A_FAVOR';
  return pagado.unidades <= 0n ? 'SIN_PAGOS' : 'PARCIAL';
}

export type EstadoDeCobro = 'AL_DIA' | 'SALDO_PENDIENTE' | 'POR_VENCER' | 'VENCIDO' | 'CANCELADO';

/** El umbral de `POR_VENCER` es constante en el MVP (ADR-0034 §3). */
export const DIAS_PARA_POR_VENCER = 7;
/** Días antes de la salida en que vence el cobro, si la agencia no fijó otro (R12). */
export const DIAS_DE_PLAZO_DE_COBRO_POR_DEFECTO = 30;
export const DIAS_DE_PLAZO_DE_COBRO_MAXIMO = 365;

export class FechaDeCobroInvalidaError extends InvariantError {
  readonly code = 'FECHA_DE_COBRO_INVALIDA';
  constructor() {
    super('La fecha de cobro debe ser una fecha de calendario AAAA-MM-DD válida');
  }
}

export class DiasDePlazoInvalidosError extends InvariantError {
  readonly code = 'DIAS_DE_PLAZO_INVALIDOS';
  constructor() {
    super(`Los días del plazo de cobro son un entero entre 0 y ${DIAS_DE_PLAZO_DE_COBRO_MAXIMO}`);
  }
}

const DIA_MS = 86_400_000;

/** Días enteros desde 1970-01-01 (UTC) de una fecha de calendario `AAAA-MM-DD`. */
function diasDesdeEpoch(fecha: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new FechaDeCobroInvalidaError();
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const instante = new Date(Date.UTC(a, mes - 1, d));
  // `Date.UTC` normaliza 2027-02-30 a marzo: se comprueba que la fecha sobrevive al viaje de ida y vuelta.
  if (
    instante.getUTCFullYear() !== a ||
    instante.getUTCMonth() !== mes - 1 ||
    instante.getUTCDate() !== d
  ) {
    throw new FechaDeCobroInvalidaError();
  }
  return Math.round(instante.getTime() / DIA_MS);
}

/** `true` si `fecha` es una fecha de calendario `AAAA-MM-DD` real. */
export function esFechaDeCalendario(fecha: string): boolean {
  try {
    diasDesdeEpoch(fecha);
    return true;
  } catch (e) {
    if (e instanceof FechaDeCobroInvalidaError) return false;
    throw e;
  }
}

/** `hasta − desde` en días de calendario (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return diasDesdeEpoch(hasta) - diasDesdeEpoch(desde);
}

/** `fecha − dias` como `AAAA-MM-DD`. */
export function restarDias(fecha: string, dias: number): string {
  const instante = new Date((diasDesdeEpoch(fecha) - dias) * DIA_MS);
  return instante.toISOString().slice(0, 10);
}

export interface EntradaDeFechaLimite {
  /** `AAAA-MM-DD`. */
  fechaSalida: string;
  /** Día de creación del archivo en la zona de la agencia, `AAAA-MM-DD`. */
  creadoEl: string;
  /** N de la agencia; por defecto 30. Entero entre 0 y 365. */
  diasDePlazo?: number;
  /** El `vence_el` de la última fila de `plazos_de_cobro` del archivo, si la hay. */
  plazoManual?: string | null;
}

/**
 * Fecha límite de cobro: la última fijada a mano, y si no, `max(salida − N días, creación)`. Una
 * venta con salida a menos de N días no nace vencida: nace con fecha límite el día de su creación.
 */
export function fechaLimiteDeCobro(e: EntradaDeFechaLimite): string {
  if (e.plazoManual) {
    diasDesdeEpoch(e.plazoManual);
    return e.plazoManual;
  }
  const n = e.diasDePlazo ?? DIAS_DE_PLAZO_DE_COBRO_POR_DEFECTO;
  if (!Number.isInteger(n) || n < 0 || n > DIAS_DE_PLAZO_DE_COBRO_MAXIMO) {
    throw new DiasDePlazoInvalidosError();
  }
  const porSalida = restarDias(e.fechaSalida, n);
  diasDesdeEpoch(e.creadoEl);
  // Las fechas `AAAA-MM-DD` se ordenan como texto.
  return porSalida > e.creadoEl ? porSalida : e.creadoEl;
}

/**
 * Estado de cobro (a tiempo), con `hoy` en la zona de la agencia y `d = fechaLimite − hoy`:
 *
 *   CANCELADO        archivo cancelado (no cuenta como deudor)
 *   AL_DIA           saldo ≤ 0
 *   SALDO_PENDIENTE  saldo > 0 y d > 7
 *   POR_VENCER       saldo > 0 y 0 ≤ d ≤ 7
 *   VENCIDO          saldo > 0 y d < 0
 */
export function estadoDeCobro(e: {
  estadoDelArchivo: EstadoDelArchivoParaCobro;
  saldo: Money;
  fechaLimite: string;
  hoy: string;
}): EstadoDeCobro {
  if (e.estadoDelArchivo === 'CANCELADO') return 'CANCELADO';
  if (e.saldo.unidades <= 0n) return 'AL_DIA';
  const d = diasEntre(e.hoy, e.fechaLimite);
  if (d < 0) return 'VENCIDO';
  if (d <= DIAS_PARA_POR_VENCER) return 'POR_VENCER';
  return 'SALDO_PENDIENTE';
}

export interface CobroCalculado {
  total: Money;
  pagado: Money;
  saldo: Money;
  situacion: SituacionDelSaldo;
  fechaLimite: string;
  estadoDeCobro: EstadoDeCobro;
}

/** Todo junto: lo que lee el detalle del archivo y la vista «quién pagó y quién debe». */
export function calcularCobro(e: {
  estadoDelArchivo: EstadoDelArchivoParaCobro;
  ventaUnidades: bigint;
  moneda: CodigoMoneda;
  sumas: SumasDeCobro;
  fechaSalida: string;
  creadoEl: string;
  diasDePlazo?: number;
  plazoManual?: string | null;
  hoy: string;
}): CobroCalculado {
  const total = totalDelArchivo(e.estadoDelArchivo, e.ventaUnidades, e.sumas, e.moneda);
  const pagado = pagadoNeto(e.sumas, e.moneda);
  const saldo = saldoDelArchivo(total, pagado);
  const fechaLimite = fechaLimiteDeCobro({
    fechaSalida: e.fechaSalida,
    creadoEl: e.creadoEl,
    ...(e.diasDePlazo === undefined ? {} : { diasDePlazo: e.diasDePlazo }),
    ...(e.plazoManual === undefined ? {} : { plazoManual: e.plazoManual }),
  });
  return {
    total,
    pagado,
    saldo,
    situacion: situacionDelSaldo(total, pagado),
    fechaLimite,
    estadoDeCobro: estadoDeCobro({
      estadoDelArchivo: e.estadoDelArchivo,
      saldo,
      fechaLimite,
      hoy: e.hoy,
    }),
  };
}
