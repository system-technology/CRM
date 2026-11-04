/**
 * Lógica pura de la cuenta regresiva de la ventana de atención al cliente de 24 horas de Meta
 * con reloj inyectable y evaluación de plantillas de reapertura (T-113).
 *
 * Reglas de dominio:
 * - La ventana dura 24 horas desde el último mensaje entrante del viajero (`ultimoMensajeClienteEn`)
 *   o hasta el instante `expiraEn` calculado por el backend.
 * - Más de 2 horas restantes (> 120 min): estado `'abierta'`.
 * - 2 horas o menos restantes (<= 120 min y > 0 ms): estado `'ambar'` (aviso preventivo).
 * - Tiempo agotado (<= 0 ms) o sin ventana activa: estado `'cerrada'` con explicación y bloqueo
 *   de texto libre, ofreciendo reapertura mediante plantilla HSM aprobada.
 */

import type { EstadoPlantilla } from '@viajapro/contracts';

export const DURACION_VENTANA_24H_MS = 24 * 60 * 60 * 1000;
export const UMBRAL_AMBAR_VENTANA_MINUTOS = 120;
export const UMBRAL_AMBAR_VENTANA_MS = UMBRAL_AMBAR_VENTANA_MINUTOS * 60 * 1000;

export type RelojInyectable = (() => number) | Date | number;

export type NivelVentana24h = 'abierta' | 'ambar' | 'cerrada';

export interface EntradaCalculoVentana24h {
  /** Fecha/hora ISO o Date en que vence la ventana de 24 h (si viene del servidor). */
  expiraEn?: string | Date | null | undefined;
  /** Fecha/hora ISO o Date del último mensaje entrante del cliente (si se calcula desde origen). */
  ultimoMensajeClienteEn?: string | Date | null | undefined;
  /** Si el servidor marcó explícitamente la ventana como cerrada (`ventana.abierta === false`). */
  abiertaServidor?: boolean | undefined;
}

export interface EstadoCuentaRegresiva24h {
  nivel: NivelVentana24h;
  abierta: boolean;
  cerrada: boolean;
  esAmbar: boolean;
  horasRestantes: number;
  minutosRestantes: number;
  minutosTotalesRestantes: number;
  milisegundosRestantes: number;
  expiraEnIso: string | null;
  etiquetaTiempo: string;
  tituloEstado: string;
  explicacion: string;
}

export interface PlantillaResumenReapertura {
  id: string;
  nombre: string;
  estado: EstadoPlantilla;
  encabezado?: string | null | undefined;
}

export interface EvaluacionPlantillaReapertura {
  habilitada: boolean;
  cantidadAprobadas: number;
  plantillaSugerida: PlantillaResumenReapertura | null;
  etiquetaBoton: string;
  motivoDeshabilitada: string | null;
}

function resolverAhoraMs(reloj?: RelojInyectable): number {
  if (typeof reloj === 'function') {
    return reloj();
  }
  if (reloj instanceof Date) {
    return reloj.getTime();
  }
  if (typeof reloj === 'number' && Number.isFinite(reloj)) {
    return reloj;
  }
  return Date.now();
}

function parsearFechaMs(valor: string | Date | null | undefined): number | null {
  if (!valor) return null;
  const ms = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Calcula la fecha ISO de expiración sumando 24 horas al último mensaje entrante del viajero.
 */
export function calcularExpiracionDesdeUltimoMensaje(
  ultimoMensajeClienteEn: string | Date | null | undefined,
): string | null {
  const origenMs = parsearFechaMs(ultimoMensajeClienteEn);
  if (origenMs === null) return null;
  return new Date(origenMs + DURACION_VENTANA_24H_MS).toISOString();
}

/**
 * Formatea horas y minutos restantes en español claro (`14 h 25 min`, `1 h 05 min`, `42 min`).
 */
export function formatearHorasYMinutosRestantes(horas: number, minutos: number): string {
  const h = Math.max(0, Math.floor(horas));
  const m = Math.max(0, Math.floor(minutos));
  if (h > 0) {
    return `${h} h ${m} min`;
  }
  return `${m} min`;
}

/**
 * Calcula de forma pura el estado completo de la cuenta regresiva de 24 h usando un reloj inyectable.
 */
export function calcularCuentaRegresivaVentana24h(
  entrada: EntradaCalculoVentana24h | string | Date | null | undefined,
  reloj?: RelojInyectable,
): EstadoCuentaRegresiva24h {
  const ahoraMs = resolverAhoraMs(reloj);

  const opciones: EntradaCalculoVentana24h =
    entrada &&
    typeof entrada === 'object' &&
    !(entrada instanceof Date) &&
    ('expiraEn' in entrada || 'ultimoMensajeClienteEn' in entrada || 'abiertaServidor' in entrada)
      ? entrada
      : { expiraEn: entrada as string | Date | null | undefined };

  const expiraMsDirecto = parsearFechaMs(opciones.expiraEn);
  const ultimoMensajeMs = parsearFechaMs(opciones.ultimoMensajeClienteEn);
  const expiraMs =
    expiraMsDirecto !== null
      ? expiraMsDirecto
      : ultimoMensajeMs !== null
        ? ultimoMensajeMs + DURACION_VENTANA_24H_MS
        : null;

  const estadoCerrada = (expiraEnIso: string | null = null): EstadoCuentaRegresiva24h => ({
    nivel: 'cerrada',
    abierta: false,
    cerrada: true,
    esAmbar: false,
    horasRestantes: 0,
    minutosRestantes: 0,
    minutosTotalesRestantes: 0,
    milisegundosRestantes: 0,
    expiraEnIso,
    etiquetaTiempo: 'Cerrada',
    tituloEstado: 'Ventana de 24 horas cerrada',
    explicacion:
      'Han pasado más de 24 horas desde el último mensaje del viajero. Por política de WhatsApp (Meta), el envío de texto libre está deshabilitado y debes usar una plantilla aprobada para reabrir la conversación.',
  });

  if (opciones.abiertaServidor === false || expiraMs === null) {
    return estadoCerrada(expiraMs !== null ? new Date(expiraMs).toISOString() : null);
  }

  const difMs = expiraMs - ahoraMs;
  if (difMs <= 0) {
    return estadoCerrada(new Date(expiraMs).toISOString());
  }

  const minutosTotales = Math.max(1, Math.floor(difMs / 60_000));
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  const esAmbar = difMs <= UMBRAL_AMBAR_VENTANA_MS;
  const etiquetaTiempo = formatearHorasYMinutosRestantes(horas, minutos);
  const expiraEnIso = new Date(expiraMs).toISOString();

  if (esAmbar) {
    return {
      nivel: 'ambar',
      abierta: true,
      cerrada: false,
      esAmbar: true,
      horasRestantes: horas,
      minutosRestantes: minutos,
      minutosTotalesRestantes: minutosTotales,
      milisegundosRestantes: difMs,
      expiraEnIso,
      etiquetaTiempo,
      tituloEstado: `Ventana por vencer (${etiquetaTiempo})`,
      explicacion: `Quedan ${etiquetaTiempo} desde el último mensaje del cliente. Responde ahora o al cerrarse necesitarás una plantilla aprobada por Meta.`,
    };
  }

  return {
    nivel: 'abierta',
    abierta: true,
    cerrada: false,
    esAmbar: false,
    horasRestantes: horas,
    minutosRestantes: minutos,
    minutosTotalesRestantes: minutosTotales,
    milisegundosRestantes: difMs,
    expiraEnIso,
    etiquetaTiempo,
    tituloEstado: `Ventana activa (${etiquetaTiempo})`,
    explicacion: `Quedan ${etiquetaTiempo} para responder con mensajes de texto libre o cotizaciones.`,
  };
}

/**
 * Determina si el compositor puede ofrecer una plantilla de reapertura activa o si el botón
 * debe mostrarse deshabilitado por falta de plantillas aprobadas en la agencia.
 */
export function evaluarReaperturaConPlantilla(
  plantillas: ReadonlyArray<PlantillaResumenReapertura> | null | undefined,
): EvaluacionPlantillaReapertura {
  const lista: ReadonlyArray<PlantillaResumenReapertura> = plantillas ?? [];
  const aprobadas = lista.filter((p) => p.estado === 'APROBADA');
  const primera = aprobadas[0] ?? null;

  if (!primera) {
    return {
      habilitada: false,
      cantidadAprobadas: 0,
      plantillaSugerida: null,
      etiquetaBoton: 'Sin plantillas aprobadas para reabrir',
      motivoDeshabilitada:
        'Tu agencia aún no tiene plantillas en estado APROBADA en Meta. Sincroniza o solicita aprobación en Configuración → WhatsApp.',
    };
  }

  return {
    habilitada: true,
    cantidadAprobadas: aprobadas.length,
    plantillaSugerida: primera,
    etiquetaBoton: `Enviar plantilla de reapertura (${aprobadas.length} disponible${aprobadas.length === 1 ? '' : 's'})`,
    motivoDeshabilitada: null,
  };
}
