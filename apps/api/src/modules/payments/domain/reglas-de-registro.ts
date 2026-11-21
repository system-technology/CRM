/**
 * Las reglas de dominio que la base NO cubre y la API impone (ADR-0034 §4; nota de T-330). Puras:
 * reciben el archivo, las sumas ya serializadas por el candado y «hoy» en la zona de la agencia.
 *
 * Orden de las comprobaciones: forma del monto → moneda → fecha → tipo según el estado del archivo
 * → efecto sobre lo pagado o el total. Todo en `bigint` (R8).
 */
import {
  type EstadoDelArchivoParaCobro,
  pagadoNeto,
  saldoDelArchivo,
  type SumasDeCobro,
  totalDelArchivo,
  type TipoDeMovimientoDeCobro,
} from '@viajapro/domain';
import {
  AjusteDejaTotalNegativoError,
  DevolucionExcedeLoPagadoError,
  FechaDePagoFuturaError,
  MonedaDistintaDelArchivoError,
  MontoInvalidoParaElTipoError,
  MovimientoYaReversadoError,
  PenalidadExcedeLoPagadoError,
  ReversoDeReversoError,
  ReversoDejaPagadoNegativoError,
  SobrepagoSinConfirmarError,
  TipoNoPermitidoParaElEstadoError,
} from './errors.js';
import type { Movimiento } from './movimiento.js';
import { monedaDeLaBase } from './moneda.js';

/** El tope por movimiento (CHECK `pagos_monto_por_tipo`): 10^15 − 1. */
export const TOPE_DE_MONTO = 999_999_999_999_999n;

export interface ArchivoParaValidar {
  estado: EstadoDelArchivoParaCobro;
  ventaUnidades: bigint;
  monedaIso: string;
}

/** En qué estado del archivo se admite cada tipo (ADR-0034 §2). `null` = cualquiera. */
const ESTADO_REQUERIDO: Record<
  Exclude<TipoDeMovimientoDeCobro, 'REVERSO'>,
  EstadoDelArchivoParaCobro | null
> = {
  PAGO: 'ABIERTO',
  DEVOLUCION: null,
  AJUSTE: 'ABIERTO',
  PENALIDAD: 'CANCELADO',
};

export interface EntradaDeMovimiento {
  tipo: Exclude<TipoDeMovimientoDeCobro, 'REVERSO'>;
  montoUnidades: bigint;
  monedaDelMonto: string;
  /** `AAAA-MM-DD`; obligatoria en PAGO y DEVOLUCION. */
  pagadoEl: string | null;
  confirmarSobrepago: boolean;
}

/** Rechaza con un error tipado; si no lanza, el movimiento se puede insertar. */
export function validarMovimiento(
  e: EntradaDeMovimiento,
  archivo: ArchivoParaValidar,
  sumas: SumasDeCobro,
  hoy: string,
): void {
  // Monto: entero (bigint por construcción), dentro del tope y con el signo de su tipo.
  const m = e.montoUnidades;
  const signoValido = e.tipo === 'AJUSTE' ? m !== 0n : m > 0n;
  const dentroDelTope = m <= TOPE_DE_MONTO && m >= -TOPE_DE_MONTO;
  if (!signoValido || !dentroDelTope) throw new MontoInvalidoParaElTipoError(e.tipo);

  if (e.monedaDelMonto !== archivo.monedaIso) {
    throw new MonedaDistintaDelArchivoError(archivo.monedaIso, e.monedaDelMonto);
  }

  if (e.pagadoEl !== null && e.pagadoEl > hoy) throw new FechaDePagoFuturaError();

  const requerido = ESTADO_REQUERIDO[e.tipo];
  if (requerido !== null && archivo.estado !== requerido) {
    throw new TipoNoPermitidoParaElEstadoError(e.tipo, archivo.estado);
  }

  const moneda = monedaDeLaBase(archivo.monedaIso);
  const pagado = pagadoNeto(sumas, moneda).unidades;
  const totalActual = totalDelArchivo(archivo.estado, archivo.ventaUnidades, sumas, moneda);

  switch (e.tipo) {
    case 'PAGO': {
      // Sobrepago: lo pagado pasa del total. Se permite solo si se confirma.
      const saldoDespues = saldoDelArchivo(totalActual, pagadoNeto(sumas, moneda)).unidades - m;
      if (saldoDespues < 0n && !e.confirmarSobrepago) throw new SobrepagoSinConfirmarError();
      return;
    }
    case 'DEVOLUCION':
      if (pagado - m < 0n) throw new DevolucionExcedeLoPagadoError();
      return;
    case 'AJUSTE':
      // El total de un archivo abierto no queda negativo.
      if (totalActual.unidades + m < 0n) throw new AjusteDejaTotalNegativoError();
      return;
    case 'PENALIDAD':
      // Acumulado: las penalidades vigentes más esta no superan lo pagado y no devuelto.
      if (sumas.penalidades + m > pagado) throw new PenalidadExcedeLoPagadoError();
      return;
  }
}

/** Lo que se necesita del movimiento original para reversarlo. */
export type OriginalParaReversar = Pick<Movimiento, 'id' | 'tipo' | 'montoUnidades'>;

/** Reglas del REVERSO: una sola vez, nunca de otro reverso, y sin dejar los saldos en negativo. */
export function validarReverso(
  original: OriginalParaReversar,
  yaReversado: boolean,
  archivo: ArchivoParaValidar,
  sumas: SumasDeCobro,
): void {
  if (original.tipo === 'REVERSO') throw new ReversoDeReversoError();
  if (yaReversado) throw new MovimientoYaReversadoError();

  const moneda = monedaDeLaBase(archivo.monedaIso);
  if (original.tipo === 'PAGO') {
    if (pagadoNeto(sumas, moneda).unidades - original.montoUnidades < 0n) {
      throw new ReversoDejaPagadoNegativoError();
    }
  } else if (original.tipo === 'AJUSTE' && archivo.estado === 'ABIERTO') {
    const total = totalDelArchivo('ABIERTO', archivo.ventaUnidades, sumas, moneda).unidades;
    if (total - original.montoUnidades < 0n) throw new AjusteDejaTotalNegativoError();
  }
}
