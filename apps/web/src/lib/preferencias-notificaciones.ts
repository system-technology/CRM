/**
 * Gestión de preferencias de sonido y notificaciones del navegador para asesores (T-110).
 *
 * Cumplimiento de criterios:
 * 1. El sonido y las notificaciones del navegador SOLO se activan si el asesor lo decide expresamente.
 * 2. Cero PII en el título de las notificaciones del navegador (R10): títulos genéricos como
 *    «Nuevo mensaje de WhatsApp», «Seguimiento comercial vencido» o «Cotización por vencer».
 * 3. Síntesis de sonido nativa con Web Audio API (cero dependencias externas o archivos mp3).
 */

export interface PreferenciasNotificaciones {
  sonidoHabilitado: boolean;
  navegadorHabilitado: boolean;
  avisoMensajesNuevos: boolean;
  avisoSeguimientosVencidos: boolean;
  avisoCotizacionesPorVencer: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasNotificaciones = {
  sonidoHabilitado: false,
  navegadorHabilitado: false,
  avisoMensajesNuevos: true,
  avisoSeguimientosVencidos: true,
  avisoCotizacionesPorVencer: true,
};

const CLAVE_LOCALSTORAGE = 'viajapro_preferencias_notificaciones';

/**
 * Carga las preferencias del asesor desde localStorage con fallback seguro.
 */
export function cargarPreferenciasNotificaciones(): PreferenciasNotificaciones {
  if (typeof window === 'undefined') {
    return PREFERENCIAS_POR_DEFECTO;
  }
  try {
    const raw = localStorage.getItem(CLAVE_LOCALSTORAGE);
    if (!raw) return PREFERENCIAS_POR_DEFECTO;
    const parsed = JSON.parse(raw) as Partial<PreferenciasNotificaciones>;
    return {
      sonidoHabilitado: Boolean(parsed.sonidoHabilitado),
      navegadorHabilitado: Boolean(parsed.navegadorHabilitado),
      avisoMensajesNuevos: parsed.avisoMensajesNuevos !== false,
      avisoSeguimientosVencidos: parsed.avisoSeguimientosVencidos !== false,
      avisoCotizacionesPorVencer: parsed.avisoCotizacionesPorVencer !== false,
    };
  } catch {
    return PREFERENCIAS_POR_DEFECTO;
  }
}

/**
 * Guarda las preferencias del asesor en localStorage.
 */
export function guardarPreferenciasNotificaciones(
  prefs: PreferenciasNotificaciones,
): PreferenciasNotificaciones {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(prefs));
    } catch {
      // Ignorar fallo de cuota en entornos restringidos
    }
  }
  return prefs;
}

/**
 * Solicita permiso al navegador para emitir notificaciones de escritorio.
 */
export async function solicitarPermisoNotificaciones(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission === 'denied') {
    return false;
  }
  try {
    const resultado = await Notification.requestPermission();
    return resultado === 'granted';
  } catch {
    return false;
  }
}

/**
 * Títulos estrictamente sanitizados y SIN datos personales (R10 / T-110).
 */
export const TITULOS_SEGUROS_NOTIFICACION = {
  MENSAJE_NUEVO: 'Nuevo mensaje de WhatsApp',
  SEGUIMIENTO_VENCIDO: 'Seguimiento comercial vencido',
  COTIZACION_POR_VENCER: 'Cotización próxima a vencer',
  ALERTA_OPERATIVA: 'Alerta operativa de viaje',
} as const;

/**
 * Dispara una notificación del navegador solo si el asesor la tiene activa y autorizada.
 * Invariante R10: el título NUNCA contiene nombres, teléfonos, correos ni identificadores de personas.
 */
export function emitirNotificacionNavegador(
  tituloSeguro: string,
  cuerpoGenerico: string,
  urlDestino?: string,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  const prefs = cargarPreferenciasNotificaciones();
  if (!prefs.navegadorHabilitado || Notification.permission !== 'granted') {
    return;
  }

  try {
    const n = new Notification(tituloSeguro, {
      body: cuerpoGenerico,
      icon: '/icon.svg',
      tag: 'viajapro-alerta',
    });

    if (urlDestino) {
      n.onclick = () => {
        window.focus();
        window.location.href = urlDestino;
      };
    }
  } catch {
    // Entornos donde Notifications lanza restricción de origen
  }
}

/**
 * Sintetizador nativo de campana sutil usando Web Audio API (ADR-0011 / T-110).
 * Produce dos notas suaves (523 Hz Do5 y 659 Hz Mi5) sin dependencias ni archivos multimedia.
 */
export function reproducirSonidoNotificacion(forzar = false): void {
  if (typeof window === 'undefined') return;

  const prefs = cargarPreferenciasNotificaciones();
  if (!prefs.sonidoHabilitado && !forzar) return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    // Nota 1: 523.25 Hz (Do5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Nota 2: 659.25 Hz (Mi5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.5);
  } catch {
    // Si el usuario no ha interactuado aún con la página o audio bloqueado
  }
}
