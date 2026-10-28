/**
 * ViajaPro — Lógica de Conexión de WhatsApp Cloud API y Ventana de 24 Horas (T-106)
 *
 * Explicación en lenguaje de agencia turística (no jerga de Meta),
 * cálculo exacto de la ventana de 24 horas y estado de salud del canal sin exponer secretos (Regla R6).
 */

export type CalidadMeta = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export type EstadoConexionCanal = 'CONECTADO' | 'DEGRADADO' | 'NO_CONECTADO';

export type TierMensajeriaMeta =
  'TIER_50' | 'TIER_1K' | 'TIER_10K' | 'TIER_100K' | 'TIER_UNLIMITED';

export interface InfoCalidadCanal {
  calidad: CalidadMeta;
  etiqueta: string;
  colorBadge: string;
  descripcionAgencia: string;
  accionRecomendada: string;
}

export interface InfoTierMensajeria {
  tier: TierMensajeriaMeta;
  limiteDiario: string;
  descripcionAgencia: string;
}

export interface SimulacionVentana24h {
  abierta: boolean;
  minutosRestantes: number;
  horasRestantes: number;
  porcentajeTranscurrido: number;
  tipoMensajePermitido: 'LIBRE_ASESOR' | 'SOLO_PLANTILLA_HSM';
  etiquetaEstado: string;
  explicacionAgencia: string;
}

export interface PlantillaAgencia {
  id: string;
  nombreVisible: string;
  categoria: 'UTILIDAD' | 'MARKETING' | 'AUTENTICACION';
  ejemploTexto: string;
  variables: string[];
  finalidadAgencia: string;
}

export interface DatosConexionWhatsApp {
  conectado: boolean;
  numeroE164: string;
  nombreVisible: string;
  phoneNumberId: string;
  wabaId: string;
  calidad: CalidadMeta;
  estado: EstadoConexionCanal;
  tierMensajeria: TierMensajeriaMeta;
  webhookActivo: boolean;
  webhookUrl: string;
  ultimoPingUtc: string;
  conversacionesActivas24h: number;
}

/**
 * MOCK canónico de estado de WhatsApp para agencias en ViajaPro (T-106).
 */
export const DATOS_WHATSAPP_CONECTADO_DEFAULT: DatosConexionWhatsApp = {
  conectado: true,
  numeroE164: '+57 300 987 6543',
  nombreVisible: 'JD Tours Cartagena',
  phoneNumberId: '109283746589012',
  wabaId: '384729105829103',
  calidad: 'GREEN',
  estado: 'CONECTADO',
  tierMensajeria: 'TIER_1K',
  webhookActivo: true,
  webhookUrl: 'https://api.viajapro.com/v1/inbox/webhook/meta',
  ultimoPingUtc: new Date(Date.now() - 1000 * 60 * 3).toISOString(), // Hace 3 min
  conversacionesActivas24h: 18,
};

export const DATOS_WHATSAPP_DESCONECTADO_DEFAULT: DatosConexionWhatsApp = {
  conectado: false,
  numeroE164: '',
  nombreVisible: '',
  phoneNumberId: '',
  wabaId: '',
  calidad: 'UNKNOWN',
  estado: 'NO_CONECTADO',
  tierMensajeria: 'TIER_50',
  webhookActivo: false,
  webhookUrl: 'https://api.viajapro.com/v1/inbox/webhook/meta',
  ultimoPingUtc: '',
  conversacionesActivas24h: 0,
};

/**
 * Plantillas pre-aprobadas de uso frecuente en agencias de viajes colombianas.
 */
export const PLANTILLAS_OFICIALES_AGENCIA: readonly PlantillaAgencia[] = [
  {
    id: 'plantilla-seguimiento-cotizacion',
    nombreVisible: 'Seguimiento de Cotización Turística',
    categoria: 'UTILIDAD',
    ejemploTexto:
      '¡Hola {nombre}! Te compartimos la cotización actualizada para tu viaje a {destino}. ¿Te gustaría que ajustemos las fechas o te reservemos los cupos?',
    variables: ['{nombre}', '{destino}'],
    finalidadAgencia:
      'Reabrir la conversación tras 24 h cuando el cliente no respondió a una propuesta enviada.',
  },
  {
    id: 'plantilla-recordatorio-salida',
    nombreVisible: 'Confirmación y Punto de Encuentro de Excursión',
    categoria: 'UTILIDAD',
    ejemploTexto:
      'Hola {nombre}, te confirmamos tu salida para mañana al tour {excursion}. Punto de encuentro: {punto_encuentro} a las {hora}. Lleva bloqueador y documento de identidad.',
    variables: ['{nombre}', '{excursion}', '{punto_encuentro}', '{hora}'],
    finalidadAgencia:
      'Recordatorio operativo obligatorio 12 horas antes de la excursión para asegurar asistencia.',
  },
  {
    id: 'plantilla-solicitud-documentos',
    nombreVisible: 'Solicitud de Documentos para Asistencia Médica',
    categoria: 'UTILIDAD',
    ejemploTexto:
      'Hola {nombre}, para activar la póliza de asistencia médica y manifiesto náutico de tu viaje a {destino}, por favor envíanos los números de documento y fecha de nacimiento de tus acompañantes.',
    variables: ['{nombre}', '{destino}'],
    finalidadAgencia:
      'Recolección obligatoria de datos para la emisión del voucher antes de que expire la reserva.',
  },
  {
    id: 'plantilla-reenganche-viajero',
    nombreVisible: 'Reactivación de Viajero Interesado',
    categoria: 'MARKETING',
    ejemploTexto:
      '¡Hola {nombre}! Vimos que estuviste cotizando una experiencia en {destino}. Tenemos tarifas especiales para este fin de semana. ¿Te gustaría conocer los nuevos cupos disponibles?',
    variables: ['{nombre}', '{destino}'],
    finalidadAgencia:
      'Contactar clientes antiguos o interesados que llevan más de 48 horas sin interactuar.',
  },
] as const;

/**
 * Calcula con precisión el estado de la ventana de 24 horas a partir del timestamp del último mensaje del cliente.
 */
export function calcularEstadoVentana24h(
  ultimoMensajeUtc: string | Date,
  ahoraUtc?: string | Date,
): SimulacionVentana24h {
  const tUltimo = new Date(ultimoMensajeUtc).getTime();
  const tAhora = ahoraUtc ? new Date(ahoraUtc).getTime() : Date.now();

  const msTranscurridos = Math.max(0, tAhora - tUltimo);

  const minutosTranscurridos = Math.floor(msTranscurridos / (60 * 1000));
  const minutosTotales = 24 * 60;
  const minutosRestantes = Math.max(0, minutosTotales - minutosTranscurridos);
  const horasRestantes = +(minutosRestantes / 60).toFixed(1);

  const abierta = minutosRestantes > 0;
  const porcentaje = Math.min(100, Math.round((minutosTranscurridos / minutosTotales) * 100));

  if (abierta) {
    return {
      abierta: true,
      minutosRestantes,
      horasRestantes,
      porcentajeTranscurrido: porcentaje,
      tipoMensajePermitido: 'LIBRE_ASESOR',
      etiquetaEstado: `Ventana Abierta (${Math.floor(minutosRestantes / 60)}h ${minutosRestantes % 60}m restantes)`,
      explicacionAgencia:
        'El viajero te escribió recientemente. Puedes responder con texto libre, imágenes, notas de voz y cotizaciones personalizadas sin costo adicional.',
    };
  }

  return {
    abierta: false,
    minutosRestantes: 0,
    horasRestantes: 0,
    porcentajeTranscurrido: 100,
    tipoMensajePermitido: 'SOLO_PLANTILLA_HSM',
    etiquetaEstado: 'Ventana Cerrada (+24 horas sin respuesta)',
    explicacionAgencia:
      'Han transcurrido más de 24 horas desde el último mensaje del cliente. Para escribirle nuevamente debes enviar una plantilla pre-aprobada por WhatsApp. Cuando el cliente responda, la ventana libre se reabrirá por otras 24 horas.',
  };
}

/**
 * Interpreta el estado de calidad de Meta en términos entendibles para una agencia turística.
 */
export function interpretarCalidadMeta(calidad: CalidadMeta): InfoCalidadCanal {
  switch (calidad) {
    case 'GREEN':
      return {
        calidad: 'GREEN',
        etiqueta: 'Calidad Alta (Óptima)',
        colorBadge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        descripcionAgencia:
          'Tu línea tiene excelente reputación. Tus viajeros no han reportado mensajes como spam ni bloqueado el número.',
        accionRecomendada:
          'Continúa respondiendo rápido dentro del SLA y enviando solo cotizaciones solicitadas.',
      };
    case 'YELLOW':
      return {
        calidad: 'YELLOW',
        etiqueta: 'Calidad Media (Advertencia)',
        colorBadge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        descripcionAgencia:
          'Meta detectó que algunos usuarios bloquearon el número o marcaron mensajes recientes como no deseados.',
        accionRecomendada:
          'Reduce el envío de plantillas promocionales masivas y prioriza atender las cotizaciones entrantes.',
      };
    case 'RED':
      return {
        calidad: 'RED',
        etiqueta: 'Calidad Baja (Riesgo Crítico)',
        colorBadge: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
        descripcionAgencia:
          'Calidad en nivel crítico. Existe riesgo inminente de que Meta reduzca tu límite diario de mensajes o suspenda la línea temporalmente.',
        accionRecomendada:
          'Detén de inmediato campañas de difusión. Solo responde a clientes que hayan iniciado contacto directo contigo.',
      };
    default:
      return {
        calidad: 'UNKNOWN',
        etiqueta: 'Estado Desconocido',
        colorBadge: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
        descripcionAgencia:
          'El canal aún no ha registrado actividad suficiente para evaluar su reputación en Meta.',
        accionRecomendada:
          'Completa la verificación del número telefónico y realiza una prueba de envío.',
      };
  }
}

/**
 * Interpreta el nivel de mensajería (Tier) de Meta para una agencia de viajes.
 */
export function interpretarTierMensajeria(tier: TierMensajeriaMeta): InfoTierMensajeria {
  switch (tier) {
    case 'TIER_50':
      return {
        tier: 'TIER_50',
        limiteDiario: '50 clientes únicos / 24h',
        descripcionAgencia:
          'Límite inicial para números sin verificar en Meta Business Manager. Suficiente para pruebas de configuración.',
      };
    case 'TIER_1K':
      return {
        tier: 'TIER_1K',
        limiteDiario: '1.000 clientes únicos / 24h',
        descripcionAgencia:
          'Estándar oficial para agencias verificadas. Permite iniciar conversaciones con hasta 1.000 clientes distintos al día.',
      };
    case 'TIER_10K':
      return {
        tier: 'TIER_10K',
        limiteDiario: '10.000 clientes únicos / 24h',
        descripcionAgencia:
          'Nivel intermedio para agencias con alta demanda de cotizaciones en temporada alta (vacaciones, semana santa, fin de año).',
      };
    case 'TIER_100K':
      return {
        tier: 'TIER_100K',
        limiteDiario: '100.000 clientes únicos / 24h',
        descripcionAgencia:
          'Nivel mayorista para cadenas de agencias y operadores de turismo a gran escala.',
      };
    case 'TIER_UNLIMITED':
      return {
        tier: 'TIER_UNLIMITED',
        limiteDiario: 'Ilimitado',
        descripcionAgencia: 'Sin restricciones diarias de inicio de conversación por plantillas.',
      };
  }
}

/**
 * Valida los identificadores públicos de Meta (Phone Number ID y WABA ID).
 * Regla R6: Asegura que no se introduzcan tokens secretos en los campos.
 */
export function validarIdentificadoresPublicos(
  phoneNumberId: string,
  wabaId: string,
): { valido: boolean; error?: string | null | undefined } {
  const pId = phoneNumberId.trim();
  const wId = wabaId.trim();

  if (!pId) {
    return { valido: false, error: 'El Phone Number ID es obligatorio.' };
  }
  if (!wId) {
    return { valido: false, error: 'El WABA Account ID es obligatorio.' };
  }

  // Verificar que sean números identificadores (ej. 15 dígitos) y no tokens
  const patronSecreto = /EAAB|bearer|secret|token|sk_/i;
  if (patronSecreto.test(pId) || patronSecreto.test(wId)) {
    return {
      valido: false,
      error:
        'Regla R6: Has introducido un token o clave secreta. Solo debes ingresar los IDs numéricos públicos visibles en Meta Developers.',
    };
  }

  const patronIdNumerico = /^\d{10,25}$/;
  if (!patronIdNumerico.test(pId)) {
    return {
      valido: false,
      error:
        'El Phone Number ID debe contener entre 10 y 25 dígitos numéricos (ej. 109283746589012).',
    };
  }
  if (!patronIdNumerico.test(wId)) {
    return {
      valido: false,
      error:
        'El WABA Account ID debe contener entre 10 y 25 dígitos numéricos (ej. 384729105829103).',
    };
  }

  return { valido: true };
}
