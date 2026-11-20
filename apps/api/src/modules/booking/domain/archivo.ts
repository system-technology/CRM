/**
 * El archivo de viaje ya abierto: avance derivado, semáforo de plazos, pasajeros y cancelación
 * (ADR-0024 §3.3, §3.5, §3.7). Lógica pura: el instante llega por parámetro.
 *
 * El avance NO se guarda: lo deriva el dominio de las reservas vivas, y así «confirmado» significa
 * lo que en la agencia, que el mayorista confirmó. Pagar es otra cosa y tiene otro nombre.
 */
import {
  ArchivoCanceladoError,
  ArchivoConReservaPagadaError,
  ArchivoYaCanceladoError,
  CancelacionSinUsuarioError,
  EdadRequeridaError,
  NotaDeCancelacionRequeridaError,
  TitularInvalidoError,
} from './errors-de-operacion.js';
import { estaViva, type Reserva } from './reserva.js';

export type EstadoArchivo = 'ABIERTO' | 'CANCELADO';
export type MotivoCancelacion =
  'CLIENTE_DESISTIO' | 'SIN_DISPONIBILIDAD' | 'CAMBIO_DE_FECHA' | 'OTRO';
export type AvanceDelArchivo =
  'POR_CONFIRMAR' | 'CONFIRMADO' | 'PAGADO_A_PROVEEDORES' | 'SIN_RESERVAS_VIVAS';
export type SemaforoDePlazo = 'VENCIDO' | 'MENOS_DE_24_H' | 'EN_PLAZO';
export type TipoDePasajero = 'ADT' | 'CHD' | 'INF';

/** El umbral de «próximo» es constante (ADR-0024 §3.6.6). */
export const UMBRAL_DE_PLAZO_PROXIMO_MS = 24 * 60 * 60 * 1000;

export interface Pasajero {
  id: string;
  nombre: string;
  tipo: TipoDePasajero;
  edadAlViaje: number | null;
  esTitular: boolean;
  orden: number;
}

export interface PasajeroNuevo {
  nombre: string;
  tipo: TipoDePasajero;
  edadAlViaje: number | null;
  esTitular: boolean;
}

export interface Archivo {
  id: string;
  numero: number;
  contactoId: string;
  oportunidadId: string | null;
  cotizacionId: string;
  versionCotizacion: number;
  paqueteNombre: string;
  destino: string;
  /** `AAAA-MM-DD`. */
  fechaSalida: string;
  noches: number;
  adultos: number;
  ninos: number;
  infantes: number;
  ventaUnidades: bigint;
  monedaIso: string;
  trm: {
    monedaOrigen: string;
    monedaDestino: string;
    valor: string;
    fecha: string;
    fuente: 'OFICIAL' | 'AGENCIA';
  } | null;
  estado: EstadoArchivo;
  motivoCancelacion: MotivoCancelacion | null;
  notaCancelacion: string | null;
  canceladoEn: Date | null;
  creadoEn: Date;
  reservas: Reserva[];
  pasajeros: Pasajero[];
}

/** Lo que hay que escribir al cancelar: el archivo, y las reservas vivas que se cancelan con él. */
export interface CancelacionDelArchivo {
  motivo: MotivoCancelacion;
  nota: string | null;
  canceladoEn: Date;
  canceladoPor: string;
  reservasACancelar: string[];
}

/** El plazo que se vigila en el estado de la reserva; `null` si en ese estado no hay ninguno. */
export function plazoVigente(
  r: Pick<Reserva, 'estado' | 'timeLimit' | 'pagoTotalVenceEn'>,
): Date | null {
  if (r.estado === 'CONFIRMADA') return r.timeLimit;
  if (r.estado === 'ABONADA_AL_PROVEEDOR') return r.pagoTotalVenceEn;
  return null;
}

export function semaforoDe(plazo: Date | null, ahora: Date): SemaforoDePlazo | null {
  if (plazo === null) return null;
  const falta = plazo.getTime() - ahora.getTime();
  if (falta <= 0) return 'VENCIDO';
  return falta < UMBRAL_DE_PLAZO_PROXIMO_MS ? 'MENOS_DE_24_H' : 'EN_PLAZO';
}

const GRAVEDAD: Readonly<Record<SemaforoDePlazo, number>> = {
  VENCIDO: 0,
  MENOS_DE_24_H: 1,
  EN_PLAZO: 2,
};

/** El peor semáforo y el plazo más próximo entre las reservas vivas con plazo vigente. */
export function plazosDelArchivo(
  reservas: readonly Reserva[],
  ahora: Date,
): { proximoPlazo: Date | null; semaforo: SemaforoDePlazo | null } {
  let proximoPlazo: Date | null = null;
  let semaforo: SemaforoDePlazo | null = null;
  for (const r of reservas) {
    if (!estaViva(r)) continue;
    const plazo = plazoVigente(r);
    if (plazo === null) continue;
    if (proximoPlazo === null || plazo < proximoPlazo) proximoPlazo = plazo;
    const s = semaforoDe(plazo, ahora);
    if (s !== null && (semaforo === null || GRAVEDAD[s] < GRAVEDAD[semaforo])) semaforo = s;
  }
  return { proximoPlazo, semaforo };
}

const CONFIRMADAS_O_MAS: ReadonlySet<Reserva['estado']> = new Set([
  'CONFIRMADA',
  'ABONADA_AL_PROVEEDOR',
  'PAGADA_AL_PROVEEDOR',
]);

/** `null` en un archivo cancelado: ya no hay avance que mostrar. */
export function avanceDelArchivo(
  archivo: Pick<Archivo, 'estado' | 'reservas'>,
): AvanceDelArchivo | null {
  if (archivo.estado === 'CANCELADO') return null;
  const vivas = archivo.reservas.filter(estaViva);
  if (vivas.length === 0) return 'SIN_RESERVAS_VIVAS';
  if (vivas.every((r) => r.estado === 'PAGADA_AL_PROVEEDOR')) return 'PAGADO_A_PROVEEDORES';
  if (vivas.every((r) => CONFIRMADAS_O_MAS.has(r.estado))) return 'CONFIRMADO';
  return 'POR_CONFIRMAR';
}

/**
 * El orden de «Reservas»: el plazo vigente más próximo primero (a igual plazo, número ascendente);
 * sin plazo, al final y por número DESCENDENTE, los recién abiertos primero (T-257). Con número
 * ascendente, cuando los archivos sin plazo pasaban del límite de la lista, los nuevos (que nacen
 * sin plazo) quedaban siempre fuera. El SQL de `RepositorioDeOperacionDeArchivosPrisma.listar`
 * ordena igual antes del LIMIT.
 */
export function compararPorPlazo(
  a: { proximoPlazo: Date | null; numero: number },
  b: { proximoPlazo: Date | null; numero: number },
): number {
  if (a.proximoPlazo && b.proximoPlazo) {
    return a.proximoPlazo.getTime() - b.proximoPlazo.getTime() || a.numero - b.numero;
  }
  if (a.proximoPlazo) return -1;
  if (b.proximoPlazo) return 1;
  return b.numero - a.numero;
}

export function exigirAbierto(archivo: Pick<Archivo, 'id' | 'estado'>): void {
  if (archivo.estado === 'CANCELADO') throw new ArchivoCanceladoError(archivo.id);
}

/**
 * Valida la lista COMPLETA de pasajeros: exactamente un titular si hay alguno, y la edad de CHD e
 * INF. No compara con los conteos de la venta: eso es un aviso, no un impedimento (§3.5).
 */
export function validarPasajeros(lista: readonly PasajeroNuevo[]): void {
  if (lista.length === 0) return;
  const titulares = lista.filter((p) => p.esTitular).length;
  if (titulares !== 1) throw new TitularInvalidoError(titulares);
  lista.forEach((p, i) => {
    if (p.tipo !== 'ADT' && p.edadAlViaje === null) throw new EdadRequeridaError(i, p.tipo);
  });
}

/** «Los pasajeros no cuadran con lo vendido»: informa, no impide. Sin pasajeros aún, no avisa. */
export function pasajerosNoCuadran(
  archivo: Pick<Archivo, 'adultos' | 'ninos' | 'infantes'>,
  pasajeros: readonly Pick<Pasajero, 'tipo'>[],
): boolean {
  if (pasajeros.length === 0) return false;
  const de = (t: TipoDePasajero): number => pasajeros.filter((p) => p.tipo === t).length;
  return (
    de('ADT') !== archivo.adultos || de('CHD') !== archivo.ninos || de('INF') !== archivo.infantes
  );
}

/**
 * Cancela el archivo: con motivo, quién y cuándo; las reservas vivas se cancelan con él. Una
 * reserva ya pagada al proveedor lo impide (cancelar tras el pago total es penalidad, fuera de
 * esta rebanada). Las caídas se quedan como están.
 */
export function cancelarArchivo(
  archivo: Pick<Archivo, 'id' | 'estado' | 'reservas'>,
  entrada: {
    motivo: MotivoCancelacion;
    nota: string | null;
    ahora: Date;
    usuarioId: string | null;
  },
): CancelacionDelArchivo {
  if (archivo.estado === 'CANCELADO') throw new ArchivoYaCanceladoError(archivo.id);
  if (entrada.usuarioId === null) throw new CancelacionSinUsuarioError();
  if (entrada.motivo === 'OTRO' && (entrada.nota === null || entrada.nota.trim() === '')) {
    throw new NotaDeCancelacionRequeridaError();
  }
  if (archivo.reservas.some((r) => r.estado === 'PAGADA_AL_PROVEEDOR')) {
    throw new ArchivoConReservaPagadaError(archivo.id);
  }
  return {
    motivo: entrada.motivo,
    nota: entrada.nota,
    canceladoEn: entrada.ahora,
    canceladoPor: entrada.usuarioId,
    reservasACancelar: archivo.reservas.filter(estaViva).map((r) => r.id),
  };
}
