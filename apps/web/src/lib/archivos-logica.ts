/**
 * Lógica pura de la pantalla Reservas (archivo de viaje, T-243, ADR-0024).
 *
 * Presentación solamente: etiquetas, qué campos pide cada paso, conversión de plazos entre la zona de
 * la agencia y UTC (R9) y traducción de los errores del dominio a lenguaje claro. La autoridad sobre
 * qué transiciones son válidas es el servidor: `SIGUIENTES_ESTADOS` es solo la lista de botones que
 * se ofrecen, y cualquier rechazo (409/422) se muestra con `mensajeDeErrorDelArchivo`.
 */
import {
  ActualizarReserva,
  type AvanceDelArchivo,
  type EstadoDeReserva,
  type MotivoDeCaida,
  type MotivoDeCancelacionDelArchivo,
  type ResumenDeArchivo,
  type ReservaDelArchivo,
  type SemaforoDePlazo,
} from '@viajapro/contracts';
import { ZONA_HORARIA_COLOMBIA } from './formato';

export const ETIQUETA_ESTADO_RESERVA: Record<EstadoDeReserva, string> = {
  PENDIENTE: 'Pendiente de solicitar',
  SOLICITADA: 'Solicitada al mayorista',
  EN_ESPERA: 'En lista de espera',
  CONFIRMADA: 'Confirmada',
  ABONADA_AL_PROVEEDOR: 'Abonada al mayorista',
  PAGADA_AL_PROVEEDOR: 'Pagada al mayorista',
  CAIDA: 'Caída',
  CANCELADA: 'Cancelada',
};

/** El verbo del botón que lleva la reserva a ese estado. */
export const ACCION_HACIA_ESTADO: Record<EstadoDeReserva, string> = {
  PENDIENTE: 'Volver a pendiente',
  SOLICITADA: 'Marcar como solicitada',
  EN_ESPERA: 'Pasar a lista de espera',
  CONFIRMADA: 'Confirmar',
  ABONADA_AL_PROVEEDOR: 'Registrar abono',
  PAGADA_AL_PROVEEDOR: 'Registrar pago total',
  CAIDA: 'Marcar como caída',
  CANCELADA: 'Cancelar reserva',
};

export const ETIQUETA_AVANCE: Record<AvanceDelArchivo, string> = {
  POR_CONFIRMAR: 'Por confirmar',
  CONFIRMADO: 'Confirmado',
  PAGADO_A_PROVEEDORES: 'Pagado a mayoristas',
  SIN_RESERVAS_VIVAS: 'Sin reservas vivas',
};

export const ETIQUETA_SEMAFORO: Record<SemaforoDePlazo, string> = {
  VENCIDO: 'Vencido',
  MENOS_DE_24_H: 'Menos de 24 h',
  EN_PLAZO: 'En plazo',
};

export const ETIQUETA_MOTIVO_CAIDA: Record<MotivoDeCaida, string> = {
  TIME_LIMIT_VENCIDO: 'Se venció el time limit',
  PAGO_TOTAL_VENCIDO: 'Se venció el pago total',
  SIN_CUPO: 'El mayorista no tiene cupo',
  NEGADA_EN_ESPERA: 'Negada desde la lista de espera',
  OTRO: 'Otro motivo (explícalo en la nota)',
};

export const ETIQUETA_MOTIVO_CANCELACION: Record<MotivoDeCancelacionDelArchivo, string> = {
  CLIENTE_DESISTIO: 'El cliente desistió',
  SIN_DISPONIBILIDAD: 'Sin disponibilidad',
  CAMBIO_DE_FECHA: 'Cambio de fecha',
  OTRO: 'Otro motivo (explícalo en la nota)',
};

/** Qué botones se ofrecen desde cada estado (espejo de presentación; el servidor decide). */
export const SIGUIENTES_ESTADOS: Record<EstadoDeReserva, readonly EstadoDeReserva[]> = {
  PENDIENTE: ['SOLICITADA', 'CANCELADA'],
  SOLICITADA: ['EN_ESPERA', 'CONFIRMADA', 'CAIDA', 'CANCELADA'],
  EN_ESPERA: ['CONFIRMADA', 'CAIDA', 'CANCELADA'],
  CONFIRMADA: ['ABONADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA'],
  ABONADA_AL_PROVEEDOR: ['PAGADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA'],
  PAGADA_AL_PROVEEDOR: [],
  CAIDA: [],
  CANCELADA: [],
};

export function reservaEstaViva(r: Pick<ReservaDelArchivo, 'estado'>): boolean {
  return r.estado !== 'CAIDA' && r.estado !== 'CANCELADA';
}

/** Los campos que el formulario pide al pasar a `estado`. */
export interface CamposDelPaso {
  timeLimit: 'obligatorio' | 'no';
  pagoTotal: 'obligatorio' | 'opcional' | 'no';
  motivoCaida: boolean;
}

export function camposDelPaso(estado: EstadoDeReserva): CamposDelPaso {
  return {
    timeLimit: estado === 'CONFIRMADA' ? 'obligatorio' : 'no',
    pagoTotal:
      estado === 'ABONADA_AL_PROVEEDOR'
        ? 'obligatorio'
        : estado === 'CONFIRMADA'
          ? 'opcional'
          : 'no',
    motivoCaida: estado === 'CAIDA',
  };
}

/* ---------- Zona horaria de la agencia (R9) ---------- */

function reloj(ms: number, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const v = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
}

/** `AAAA-MM-DDTHH:mm` en la zona de la agencia → instante UTC ISO. `null` si no es válido. */
export function localAInstante(local: string, zona: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const pretendido = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  try {
    // Dos pasadas: la segunda corrige el desfase cuando cruza un cambio de horario.
    let t = pretendido - (reloj(pretendido, zona) - pretendido);
    t = pretendido - (reloj(t, zona) - t);
    return new Date(t).toISOString();
  } catch {
    return null;
  }
}

/** Instante UTC → `AAAA-MM-DDTHH:mm` en la zona de la agencia (valor de un `datetime-local`). */
export function instanteALocal(instante: string | null, zona: string): string {
  if (!instante) return '';
  const ms = Date.parse(instante);
  if (Number.isNaN(ms)) return '';
  return new Date(reloj(ms, zona)).toISOString().slice(0, 16);
}

export function zonaOPorDefecto(zona: string | null | undefined): string {
  return zona && zona.length > 0 ? zona : ZONA_HORARIA_COLOMBIA;
}

/** «vence en 5 horas», «vence en 3 días», «venció hace 2 horas». */
export function describirPlazo(plazo: string | null, ahoraMs: number = Date.now()): string {
  if (!plazo) return 'Sin plazo vigente';
  const diff = Date.parse(plazo) - ahoraMs;
  if (Number.isNaN(diff)) return 'Sin plazo vigente';
  const horas = Math.max(1, Math.round(Math.abs(diff) / 3_600_000));
  const cuanto =
    horas < 48 ? `${horas} ${horas === 1 ? 'hora' : 'horas'}` : `${Math.round(horas / 24)} días`;
  return diff < 0 ? `venció hace ${cuanto}` : `vence en ${cuanto}`;
}

/* ---------- Formulario de avance de una reserva ---------- */

export interface ValoresDelPaso {
  localizador: string;
  /** `datetime-local` en la zona de la agencia. */
  timeLimit: string;
  pagoTotal: string;
  motivoCaida: MotivoDeCaida | '';
  nota: string;
}

export type ResultadoCambio =
  | { ok: true; cambio: ActualizarReserva }
  | { ok: false; errores: Partial<Record<keyof ValoresDelPaso, string>> };

/**
 * Arma el cuerpo de `PUT .../reservas/:id` desde lo que escribió la asesora. Valida lo que exige
 * el paso (para no ir al servidor a enterarse) y de ahí en adelante manda el servidor.
 */
export function construirCambioDeReserva(
  estado: EstadoDeReserva,
  valores: ValoresDelPaso,
  zona: string,
): ResultadoCambio {
  const campos = camposDelPaso(estado);
  const errores: Partial<Record<keyof ValoresDelPaso, string>> = {};
  const cambio: Record<string, unknown> = { estado };

  const localizador = valores.localizador.trim();
  if (localizador) cambio['localizador'] = localizador;
  const nota = valores.nota.trim();
  if (nota) cambio['nota'] = nota;

  if (campos.timeLimit !== 'no') {
    const instante = valores.timeLimit ? localAInstante(valores.timeLimit, zona) : null;
    if (!instante) errores.timeLimit = 'Escribe el time limit que te dio el mayorista.';
    else cambio['timeLimit'] = instante;
  }
  if (campos.pagoTotal !== 'no') {
    const instante = valores.pagoTotal ? localAInstante(valores.pagoTotal, zona) : null;
    if (instante) cambio['pagoTotalVenceEn'] = instante;
    else if (campos.pagoTotal === 'obligatorio') {
      errores.pagoTotal = 'Escribe hasta cuándo hay que pagarle el total al mayorista.';
    }
  }
  if (campos.motivoCaida) {
    if (!valores.motivoCaida) errores.motivoCaida = 'Elige por qué cayó la reserva.';
    else cambio['motivoCaida'] = valores.motivoCaida;
    if (valores.motivoCaida === 'OTRO' && !nota) {
      errores.nota = 'Con «Otro motivo» explica qué pasó en la nota.';
    }
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  const parseo = ActualizarReserva.safeParse(cambio);
  if (!parseo.success) {
    return {
      ok: false,
      errores: { nota: 'Revisa los datos: alguno no tiene el formato esperado.' },
    };
  }
  return { ok: true, cambio: parseo.data };
}

/* ---------- Errores del dominio en lenguaje claro ---------- */

const MENSAJES_POR_CODIGO: Record<string, string> = {
  ARCHIVO_NO_ENCONTRADO:
    'Este archivo de viaje ya no existe o no es de tu agencia. Vuelve a la lista.',
  RESERVA_NO_ENCONTRADA: 'La reserva ya no existe en este archivo. Actualiza la pantalla.',
  TRANSICION_DE_RESERVA_INVALIDA:
    'La reserva no puede pasar a ese estado desde donde está. Actualiza la pantalla: puede que otra persona la haya cambiado.',
  RESERVA_CERRADA:
    'Esta reserva ya terminó (pagada, caída o cancelada): solo se puede corregir el localizador y la nota.',
  ARCHIVO_CANCELADO: 'El archivo está cancelado y ya no admite cambios.',
  ARCHIVO_YA_CANCELADO: 'El archivo ya estaba cancelado.',
  ARCHIVO_CON_RESERVA_PAGADA:
    'No se puede cancelar: alguna reserva ya está pagada al mayorista y cancelarla implica una penalidad que todavía no se gestiona aquí.',
  TIME_LIMIT_REQUERIDO: 'Para confirmar hace falta el time limit que dio el mayorista.',
  PAGO_TOTAL_REQUERIDO: 'Para registrar el abono hace falta la fecha límite de pago total.',
  MOTIVO_DE_CAIDA_REQUERIDO: 'Para marcarla como caída elige el motivo.',
  MOTIVO_DE_CAIDA_NO_APLICA: 'El motivo de caída solo se usa cuando la reserva cae.',
  PLAZO_NO_APLICA: 'Ese plazo no se puede fijar en el estado que elegiste.',
  PLAZOS_INCOHERENTES: 'El time limit no puede ser posterior a la fecha de pago total.',
  PLAZO_POSTERIOR_A_LA_SALIDA: 'Un plazo no puede caer después de la fecha de salida del viaje.',
  TITULAR_INVALIDO: 'Debe haber exactamente un titular entre los pasajeros.',
  EDAD_REQUERIDA: 'Los niños y los infantes necesitan la edad al momento del viaje.',
  NOTA_DE_CANCELACION_REQUERIDA: 'Con el motivo «Otro» la nota es obligatoria.',
  PERMISO_DENEGADO:
    'Tu rol no puede modificar archivos de viaje. Pídele al dueño de la agencia que lo haga.',
  MODO_DEMO: 'Estás en modo demostración: los cambios en reservas no se guardan.',
  ERROR_CONEXION: 'No hay conexión con el servidor. Revisa tu internet y reintenta.',
  SIN_SESION: 'Tu sesión expiró. Vuelve a ingresar.',
};

export interface ErrorConEstado {
  code?: string;
  status?: number;
  message?: string;
}

export function mensajeDeErrorDelArchivo(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorConEstado;
  const porCodigo = e.code ? MENSAJES_POR_CODIGO[e.code] : undefined;
  if (porCodigo) return porCodigo;
  switch (e.status) {
    case 401:
      return MENSAJES_POR_CODIGO['SIN_SESION']!;
    case 403:
      return MENSAJES_POR_CODIGO['PERMISO_DENEGADO']!;
    case 404:
      return 'No se encontró lo que buscabas. Actualiza la pantalla.';
    case 409:
      return 'El cambio no es posible en el estado actual. Actualiza la pantalla y reintenta.';
    case 422:
      return 'Algún dato no es válido. Revísalo y reintenta.';
    default:
      return 'No se pudo completar la operación. Reintenta; si sigue fallando, avisa a soporte.';
  }
}

/* ---------- Lista ---------- */

/** Búsqueda por número de file, destino, paquete o mayorista (el servidor ya ordena por plazo). */
export function filtrarArchivos(
  archivos: readonly ResumenDeArchivo[],
  texto: string,
): ResumenDeArchivo[] {
  const q = texto.trim().toLowerCase();
  if (!q) return [...archivos];
  return archivos.filter(
    (a) =>
      String(a.numero).includes(q) ||
      a.destino.toLowerCase().includes(q) ||
      a.paqueteNombre.toLowerCase().includes(q) ||
      a.reservas.some((r) => (r.mayoristaNombre ?? '').toLowerCase().includes(q)),
  );
}

/** La reserva viva con el plazo más urgente: lo que la lista muestra bajo el número del file. */
export function reservaMasUrgente(a: ResumenDeArchivo): ReservaDelArchivo | null {
  const conPlazo = a.reservas
    .filter((r) => reservaEstaViva(r) && r.plazoVigente)
    .sort((x, y) => Date.parse(x.plazoVigente!) - Date.parse(y.plazoVigente!));
  return conPlazo[0] ?? null;
}
