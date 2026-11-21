/**
 * Lógica pura del cobro al viajero (T-331, ADR-0034).
 *
 * Presentación y conversión de entrada solamente. La autoridad sobre el saldo es el servidor:
 * **el saldo se deriva de los movimientos y aquí NUNCA se recalcula** (ADR-0034 §2). Lo que esta
 * pantalla sí hace es traducir lo que la asesora escribe a la unidad mínima de la moneda (R8) y
 * los rechazos del dominio a lenguaje claro.
 *
 * R8, el punto delicado: en COP la unidad mínima es **el peso**, no el centavo. Un `× 100` de más
 * aquí es un error de dos órdenes de magnitud en pantalla, así que la conversión no se hace a mano:
 * la hace `Money.desdeDecimal` de `@viajapro/domain`, que conoce los decimales de cada moneda y se
 * niega a redondear por su cuenta.
 */
import { Money } from '@viajapro/domain';
import {
  MONTO_MAXIMO_DE_COBRO,
  type CobroDelArchivo,
  type Dinero,
  type EstadoDeCobro,
  type MedioDePago,
  type SituacionDelSaldo,
  type TipoDeMovimientoDeCobro,
} from '@viajapro/contracts';
import { decimalesDeMoneda, formatearDinero } from './formato';

/* ---------- Etiquetas (lenguaje ubicuo, §9 del ADR-0034) ---------- */

export const ETIQUETA_MEDIO_DE_PAGO: Record<MedioDePago, string> = {
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  CONSIGNACION: 'Consignación',
  BILLETERA_DIGITAL: 'Billetera digital',
  PSE: 'PSE',
  LINK_DE_PAGO: 'Link de pago',
  OTRO: 'Otro',
};

export const ETIQUETA_TIPO_DE_MOVIMIENTO: Record<TipoDeMovimientoDeCobro, string> = {
  PAGO: 'Pago',
  DEVOLUCION: 'Devolución',
  AJUSTE: 'Ajuste del total',
  PENALIDAD: 'Penalidad',
  REVERSO: 'Reverso',
};

export const ETIQUETA_SITUACION: Record<SituacionDelSaldo, string> = {
  SIN_PAGOS: 'Sin pagos',
  PARCIAL: 'Pago parcial',
  PAGADO: 'Pagado',
  SALDO_A_FAVOR: 'Saldo a favor',
};

export const ETIQUETA_ESTADO_DE_COBRO: Record<EstadoDeCobro, string> = {
  AL_DIA: 'Al día',
  SALDO_PENDIENTE: 'Saldo pendiente',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
  CANCELADO: 'Cancelado',
};

/**
 * Color con significado (skill `diseno-web` §2): rojo solo para lo vencido, ámbar para lo próximo.
 * Nunca un color de «todo bien» para un archivo cancelado.
 */
export type TonoDeCobro = 'ok' | 'aviso' | 'alerta' | 'neutro';

export const TONO_ESTADO_DE_COBRO: Record<EstadoDeCobro, TonoDeCobro> = {
  AL_DIA: 'ok',
  SALDO_PENDIENTE: 'neutro',
  POR_VENCER: 'aviso',
  VENCIDO: 'alerta',
  CANCELADO: 'neutro',
};

export const CLASE_TONO: Record<TonoDeCobro, string> = {
  ok: 'bg-ok-50 text-ok-700 dark:bg-ok-600/15 dark:text-ok-600',
  aviso: 'bg-aviso-50 text-aviso-700 dark:bg-aviso-600/15 dark:text-aviso-600',
  alerta: 'bg-alerta-50 text-alerta-700 dark:bg-alerta-600/15 dark:text-alerta-600',
  neutro: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
};

/* ---------- El saldo, que llega CON SIGNO ---------- */

/**
 * El mismo importe sin signo, por manipulación de texto: el dinero no pasa por coma flotante (R8).
 */
export function sinSigno(dinero: Dinero): Dinero {
  return dinero.unidades.startsWith('-')
    ? { ...dinero, unidades: dinero.unidades.slice(1) }
    : dinero;
}

type SaldoYSituacion = Pick<CobroDelArchivo, 'saldo' | 'situacion'>;

/**
 * Cómo se enseña el saldo.
 *
 * El dominio lo devuelve con signo (`packages/domain/src/cobro.ts`: «positivo = el viajero debe;
 * negativo = saldo a favor»). En pantalla ese signo se convierte en **palabras**, nunca en un
 * «Saldo a favor −$ 100.000», que se lee como una deuda con el signo al revés. El importe que se
 * pinta va siempre en positivo y es la etiqueta la que dice de qué lado está el dinero.
 */
export function saldoEnPantalla(cobro: SaldoYSituacion): { etiqueta: string; dinero: Dinero } {
  return cobro.situacion === 'SALDO_A_FAVOR'
    ? { etiqueta: 'Saldo a favor', dinero: sinSigno(cobro.saldo) }
    : { etiqueta: 'Falta por cobrar', dinero: cobro.saldo };
}

/** La frase que cierra la confirmación de un pago. Nunca «Falta por cobrar» un importe negativo. */
export function fraseDeSaldo(cobro: SaldoYSituacion): string {
  if (cobro.situacion === 'SALDO_A_FAVOR') {
    return `Queda saldo a favor de ${formatearDinero(sinSigno(cobro.saldo))}.`;
  }
  if (cobro.situacion === 'PAGADO') return 'El archivo queda pagado.';
  return `Falta por cobrar ${formatearDinero(cobro.saldo)}.`;
}

/* ---------- El monto que escribe la asesora ---------- */

export type MontoEscrito = { ok: true; unidades: string } | { ok: false; motivo: string };

/**
 * Decimales de la moneda, para el texto de ayuda del campo. No hay tabla aquí: es la misma función
 * que usa el formateo (`decimalesDeMoneda`, que lee `MONEDAS` de `@viajapro/domain`), porque dos
 * tablas de decimales que se separan son el error de R8 otra vez (T-520).
 */
export function decimalesDe(moneda: string): number {
  return decimalesDeMoneda(moneda);
}

export function admiteCentavos(moneda: string): boolean {
  return decimalesDe(moneda) > 0;
}

/**
 * Convierte lo escrito en es-CO (`1.250.000`, `12.500,50`) a la unidad mínima de `moneda`.
 *
 * Formato estricto a propósito: **el punto es separador de miles y la coma de decimales**. Aceptar
 * el punto como decimal haría de `1.500` un número ambiguo (mil quinientos pesos o un dólar y
 * medio), y en una pantalla de dinero la ambigüedad se cobra. Se rechaza con un mensaje que dice
 * cómo escribirlo, nunca interpretando a medias.
 */
export function aUnidadesMinimas(texto: string, moneda: string): MontoEscrito {
  const limpio = texto.trim().replace(/[\s$]/g, '');
  if (limpio === '') return { ok: false, motivo: 'Escribe cuánto pagó el viajero.' };
  if (limpio.startsWith('-')) {
    return {
      ok: false,
      motivo: 'Un pago es un monto positivo. Para devolver dinero se registra una devolución.',
    };
  }

  // Miles en grupos de tres, o sin separador. Una sola coma, para los decimales.
  const conMiles = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio);
  const sinMiles = /^\d+(,\d+)?$/.test(limpio);
  if (!conMiles && !sinMiles) {
    return {
      ok: false,
      motivo:
        'Escribe solo números, con punto para los miles y coma para los decimales (1.250.000).',
    };
  }

  const [entera = '0', fraccion] = limpio.replace(/\./g, '').split(',');
  const decimal = fraccion === undefined ? entera : `${entera}.${fraccion}`;

  let monto: Money;
  try {
    monto = Money.desdeDecimal(decimal, moneda);
  } catch {
    return {
      ok: false,
      motivo: admiteCentavos(moneda)
        ? `En ${moneda} el monto admite hasta dos decimales. Revisa la cifra.`
        : `En ${moneda} no se usan centavos: escribe un monto entero (1.250.000).`,
    };
  }

  if (monto.unidades === 0n) return { ok: false, motivo: 'El pago debe ser mayor que cero.' };
  if (monto.unidades > MONTO_MAXIMO_DE_COBRO) {
    return { ok: false, motivo: 'El monto es demasiado grande. Revisa la cifra.' };
  }
  return { ok: true, unidades: monto.unidades.toString() };
}

/* ---------- Fecha de pago ---------- */

/** `AAAA-MM-DD` de hoy en la zona de la agencia (R9): el tope del campo «Fecha del pago». */
export function hoyEnLaAgencia(zona: string, ahora: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ahora);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ahora);
  }
}

/* ---------- Errores ---------- */

const MENSAJES_POR_CODIGO: Record<string, string> = {
  SIN_SESION: 'Tu sesión expiró. Vuelve a ingresar.',
  ERROR_CONEXION: 'No se pudo conectar con el servidor. Revisa tu conexión y reintenta.',
  MODO_DEMO: 'En modo demostración los pagos no se guardan.',
  PERMISO_DENEGADO:
    'Tu rol no puede registrar este movimiento. Pide a quien administra la agencia el permiso «Registrar pagos».',
  FECHA_DE_PAGO_FUTURA: 'La fecha del pago no puede ser futura. Elige hoy o un día anterior.',
  MONEDA_DISTINTA_DEL_ARCHIVO:
    'El pago debe ir en la misma moneda del archivo de viaje. Actualiza la pantalla y reintenta.',
  SOBREPAGO_SIN_CONFIRMAR:
    'Este pago deja saldo a favor del viajero. Confirma abajo si es correcto.',
  MONTO_INVALIDO_PARA_EL_TIPO: 'El monto no es válido para un pago. Revisa la cifra.',
  TIPO_NO_PERMITIDO_PARA_EL_ESTADO_DEL_ARCHIVO:
    'Este archivo está cancelado: ya no admite pagos nuevos.',
  CLAVE_DE_IDEMPOTENCIA_REUTILIZADA:
    'Ese pago ya se había registrado con otros datos. Actualiza la pantalla y revisa el historial.',
  COBRO_OCUPADO_REINTENTA: 'Alguien más está registrando un pago en este archivo. Reintenta.',
  PAGADOR_NO_ENCONTRADO: 'Quien pagó no es un contacto de esta agencia.',
  ARCHIVO_NO_ENCONTRADO: 'Este archivo de viaje ya no existe. Actualiza la pantalla.',
};

interface ErrorConEstado {
  code?: string;
  status?: number;
  message?: string;
}

/** Nunca el texto crudo del servidor: qué pasó y qué hacer (skill `diseno-web` §4). */
export function mensajeDeErrorDeCobro(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorConEstado;
  const porCodigo = e.code ? MENSAJES_POR_CODIGO[e.code] : undefined;
  if (porCodigo) return porCodigo;
  switch (e.status) {
    case 401:
      return MENSAJES_POR_CODIGO['SIN_SESION']!;
    case 403:
      return MENSAJES_POR_CODIGO['PERMISO_DENEGADO']!;
    case 404:
      return 'No se encontró el cobro de este archivo. Actualiza la pantalla.';
    case 409:
      return 'El pago no es posible en el estado actual del archivo. Actualiza la pantalla y reintenta.';
    case 422:
      return 'Algún dato del pago no es válido. Revísalo y reintenta.';
    default:
      return 'No se pudo registrar el pago. Reintenta; si sigue fallando, avisa a soporte.';
  }
}

/** `true` si el rechazo del servidor es el sobrepago que la asesora puede confirmar. */
export function esSobrepagoSinConfirmar(error: unknown): boolean {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorConEstado;
  return e.code === 'SOBREPAGO_SIN_CONFIRMAR';
}
