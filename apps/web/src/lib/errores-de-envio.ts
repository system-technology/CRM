/**
 * Mapeo exhaustivo y amigable en es-CO de los errores de envío de mensajería (WhatsApp / Inbox).
 *
 * El asesor de agencia NUNCA debe ver códigos técnicos crudos (ej. VENTANA_CERRADA,
 * CONSENTIMIENTO_REVOCADO, COTIZACION_DE_OTRO_CONTACTO, WHATSAPP_LIMIT_REACHED, etc.).
 * Cada error se traduce a una explicación comprensible y a una acción concreta sugerida.
 */

export type TipoAccionErrorEnvio =
  | 'usar_plantilla'
  | 'ver_consentimiento'
  | 'cambiar_cotizacion'
  | 'abrir_cotizador'
  | 'recargar_bandeja'
  | 'recargar'
  | 'reasignar'
  | 'verificar_telefono'
  | 'contactar_admin'
  | 'iniciar_sesion'
  | 'reintentar';

export interface DetalleErrorEnvio {
  /** Código canónico normalizado para lógica de control y telemetría interna */
  codigo: string;
  /** Título breve y claro en es-CO, sin tecnicismos */
  titulo: string;
  /** Explicación comprensible para el asesor de la agencia */
  mensaje: string;
  /** Acción concreta que puede ejecutar el asesor */
  accionSugerida: string;
  /** Si tiene sentido reintentar de inmediato la misma acción */
  reintentable: boolean;
  /** Tipo semántico de la acción recomendada */
  tipoAccion: TipoAccionErrorEnvio;
  /** Texto completo para mostrar en banners o alertas inline (sin códigos crudos) */
  textoParaMostrar: string;
}

export type DefinicionErrorEnvio = Omit<DetalleErrorEnvio, 'codigo' | 'textoParaMostrar'>;

const FALLBACK_DESCONOCIDO: DefinicionErrorEnvio = {
  titulo: 'Inconveniente al enviar el mensaje',
  mensaje: 'Ocurrió un contratiempo al procesar el envío del mensaje.',
  accionSugerida: 'Espera unos segundos y vuelve a intentar el envío.',
  reintentable: true,
  tipoAccion: 'reintentar',
};

export const MAPA_ERRORES_ENVIO: Record<string, DefinicionErrorEnvio> = {
  // Ventana de 24 horas de Meta (HSM obligatorio fuera de ventana)
  VENTANA_CERRADA: {
    titulo: 'Ventana de 24 horas cerrada',
    mensaje:
      'La ventana de servicio de 24 horas está cerrada. WhatsApp no permite enviar mensajes libres si el viajero no ha escrito en las últimas 24 horas.',
    accionSugerida:
      'Envía una plantilla aprobada por Meta para reanudar el contacto con el cliente.',
    reintentable: false,
    tipoAccion: 'usar_plantilla',
  },
  WHATSAPP_FUERA_DE_VENTANA: {
    titulo: 'Ventana de 24 horas cerrada',
    mensaje:
      'La ventana de servicio de 24 horas está cerrada. WhatsApp no permite enviar mensajes libres si el viajero no ha escrito en las últimas 24 horas.',
    accionSugerida:
      'Envía una plantilla aprobada por Meta para reanudar el contacto con el cliente.',
    reintentable: false,
    tipoAccion: 'usar_plantilla',
  },

  // Consentimiento Habeas Data / Ley 1581
  CONSENTIMIENTO_REVOCADO: {
    titulo: 'Autorización de datos revocada',
    mensaje:
      'El contacto revocó su autorización para recibir comunicaciones bajo la Ley 1581 (Habeas Data).',
    accionSugerida:
      'Verifica con el cliente si desea otorgar nuevamente su autorización en la ficha de contacto antes de escribirle.',
    reintentable: false,
    tipoAccion: 'ver_consentimiento',
  },

  // Cotizaciones en inbox
  COTIZACION_DE_OTRO_CONTACTO: {
    titulo: 'Cotización de otro contacto',
    mensaje:
      'La cotización seleccionada pertenece a otro viajero y no puede enviarse en esta conversación.',
    accionSugerida: 'Selecciona o elabora una cotización correspondiente a este contacto.',
    reintentable: false,
    tipoAccion: 'cambiar_cotizacion',
  },
  COTIZACION_PARA_ENVIO_NO_ENCONTRADA: {
    titulo: 'Cotización no encontrada',
    mensaje: 'No encontramos la cotización o la versión que intentas enviar.',
    accionSugerida:
      'Verifica que la cotización exista o elabora una nueva propuesta desde el cotizador.',
    reintentable: false,
    tipoAccion: 'abrir_cotizador',
  },
  COTIZACION_NO_ENCONTRADA: {
    titulo: 'Cotización no encontrada',
    mensaje: 'No encontramos la cotización o la versión que intentas enviar.',
    accionSugerida:
      'Verifica que la cotización exista o elabora una nueva propuesta desde el cotizador.',
    reintentable: false,
    tipoAccion: 'abrir_cotizador',
  },

  // Conversaciones y concurrencia
  CONVERSACION_NO_ENCONTRADA: {
    titulo: 'Conversación no disponible',
    mensaje:
      'La conversación ya no existe, fue reasignada a otro asesor o no tienes acceso a ella.',
    accionSugerida: 'Actualiza la bandeja para ver tus conversaciones asignadas.',
    reintentable: false,
    tipoAccion: 'recargar_bandeja',
  },
  CONVERSACION_MODIFICADA: {
    titulo: 'Conversación actualizada',
    mensaje: 'La conversación recibió nuevos mensajes mientras redactabas tu respuesta.',
    accionSugerida: 'Recarga los mensajes más recientes y vuelve a enviar.',
    reintentable: true,
    tipoAccion: 'recargar',
  },
  CLAVE_DE_IDEMPOTENCIA_EN_USO: {
    titulo: 'Envío ya procesado',
    mensaje:
      'Esta solicitud ya fue registrada con anterioridad para evitar enviar mensajes duplicados.',
    accionSugerida: 'Actualiza el chat para verificar el estado de entrega del mensaje.',
    reintentable: false,
    tipoAccion: 'recargar',
  },

  // Asignación de asesores
  USUARIO_NO_ASIGNABLE: {
    titulo: 'Asesor no disponible',
    mensaje:
      'El asesor seleccionado no puede recibir asignaciones de conversaciones en este momento.',
    accionSugerida:
      'Asigna la conversación a un compañero activo o consúltalo con el administrador.',
    reintentable: false,
    tipoAccion: 'reasignar',
  },

  // Canal y conexión Meta
  CANAL_NO_ACTIVO: {
    titulo: 'Línea de WhatsApp desconectada',
    mensaje: 'La línea telefónica de WhatsApp de la agencia está inactiva o desconectada de Meta.',
    accionSugerida:
      'Pide al administrador de la agencia que revise la conexión de la línea en ajustes.',
    reintentable: false,
    tipoAccion: 'contactar_admin',
  },
  WHATSAPP_DESTINATARIO_NO_DISPONIBLE: {
    titulo: 'Número sin WhatsApp activo',
    mensaje:
      'El número de teléfono del cliente no tiene una cuenta de WhatsApp o no puede recibir mensajes.',
    accionSugerida:
      'Confirma el número telefónico del cliente o contáctalo por llamada telefónica o correo.',
    reintentable: false,
    tipoAccion: 'verificar_telefono',
  },
  WHATSAPP_LIMITE_DE_TASA: {
    titulo: 'Límite de envíos alcanzado',
    mensaje: 'WhatsApp está regulando el volumen de envíos de la agencia temporalmente.',
    accionSugerida: 'Espera un par de minutos antes de reenviar el mensaje.',
    reintentable: true,
    tipoAccion: 'reintentar',
  },
  WHATSAPP_CREDENCIAL_INVALIDA: {
    titulo: 'Conexión con WhatsApp vencida',
    mensaje:
      'El permiso o token de conexión con WhatsApp caducó o no tiene los permisos necesarios.',
    accionSugerida:
      'Pide al administrador de la agencia que renueve la conexión en los ajustes del canal.',
    reintentable: false,
    tipoAccion: 'contactar_admin',
  },
  WHATSAPP_CREDENCIAL_NO_DISPONIBLE: {
    titulo: 'WhatsApp no configurado',
    mensaje: 'El envío por WhatsApp no está configurado para la línea telefónica de esta agencia.',
    accionSugerida:
      'Pide al administrador de la agencia que configure las credenciales de WhatsApp.',
    reintentable: false,
    tipoAccion: 'contactar_admin',
  },
  WHATSAPP_CUENTA_RESTRINGIDA: {
    titulo: 'Cuenta de WhatsApp restringida',
    mensaje:
      'Meta aplicó una restricción temporal sobre la cuenta de WhatsApp de la agencia o hay un saldo pendiente.',
    accionSugerida:
      'Avisa al administrador para revisar el estado en el administrador comercial de Meta.',
    reintentable: false,
    tipoAccion: 'contactar_admin',
  },
  WHATSAPP_FALLO_TRANSITORIO: {
    titulo: 'Intermitencia en WhatsApp',
    mensaje: 'Los servidores de WhatsApp presentaron una falla momentánea al despachar el mensaje.',
    accionSugerida: 'El mensaje no salió. Vuelve a intentarlo en unos instantes.',
    reintentable: true,
    tipoAccion: 'reintentar',
  },
  WHATSAPP_INALCANZABLE: {
    titulo: 'Sin conexión con WhatsApp',
    mensaje: 'No fue posible contactar a los servidores de WhatsApp antes de despachar el mensaje.',
    accionSugerida: 'Revisa tu conexión a internet y vuelve a intentar el envío.',
    reintentable: true,
    tipoAccion: 'reintentar',
  },
  WHATSAPP_ENVIO_SIN_CONFIRMAR: {
    titulo: 'Confirmación de entrega pendiente',
    mensaje: 'El mensaje fue enviado a Meta pero aún no recibimos confirmación de entrega.',
    accionSugerida:
      'Espera un minuto y revisa el chat antes de reenviarlo para no duplicar mensajes.',
    reintentable: false,
    tipoAccion: 'recargar',
  },
  WHATSAPP_ENVIO_RECHAZADO: {
    titulo: 'Mensaje rechazado por WhatsApp',
    mensaje: 'WhatsApp no admitió el formato o el destinatario del mensaje que intentas enviar.',
    accionSugerida: 'Revisa el contenido del mensaje o pide apoyo a soporte si persiste.',
    reintentable: false,
    tipoAccion: 'reintentar',
  },

  // Adjuntos y paginación
  ADJUNTO_NO_ENCONTRADO: {
    titulo: 'Archivo no disponible',
    mensaje: 'El archivo adjunto que intentas enviar no se encuentra en el servidor.',
    accionSugerida: 'Sube nuevamente el documento o imagen y reintenta el envío.',
    reintentable: false,
    tipoAccion: 'reintentar',
  },
  CURSOR_INVALIDO: {
    titulo: 'Error de sincronización',
    mensaje: 'No fue posible sincronizar el bloque de mensajes solicitado.',
    accionSugerida: 'Actualiza la conversación para sincronizar el historial completo.',
    reintentable: true,
    tipoAccion: 'recargar',
  },

  // Sesión y autenticación
  SIN_USUARIO: {
    titulo: 'Sesión no identificada',
    mensaje: 'Se requiere una sesión activa de asesor de la agencia para enviar mensajes.',
    accionSugerida: 'Inicia sesión de nuevo para continuar atendiendo la bandeja.',
    reintentable: false,
    tipoAccion: 'iniciar_sesion',
  },
  SIN_SESION: {
    titulo: 'Sesión expirada',
    mensaje: 'Tu sesión en ViajaPro ha expirado.',
    accionSugerida: 'Inicia sesión nuevamente para continuar enviando mensajes.',
    reintentable: false,
    tipoAccion: 'iniciar_sesion',
  },

  // Red y transporte
  ERROR_CONEXION: {
    titulo: 'Sin conexión con el servidor',
    mensaje: 'No fue posible comunicar con el servidor de mensajería.',
    accionSugerida: 'Revisa tu conexión a internet y vuelve a intentar el envío.',
    reintentable: true,
    tipoAccion: 'reintentar',
  },
  CUERPO_DEMASIADO_GRANDE: {
    titulo: 'Mensaje muy extenso',
    mensaje: 'El texto o archivo supera el tamaño máximo permitido por la plataforma.',
    accionSugerida: 'Reduce el contenido e intenta enviar nuevamente.',
    reintentable: false,
    tipoAccion: 'reintentar',
  },
  PETICION_INVALIDA: {
    titulo: 'Datos no válidos',
    mensaje: 'El mensaje no cumple con los requisitos necesarios para su envío.',
    accionSugerida: 'Verifica el contenido y vuelve a redactarlo.',
    reintentable: false,
    tipoAccion: 'reintentar',
  },
};

/**
 * Extrae el código de error técnico de cualquier estructura desconocida,
 * sin exponerlo nunca en los textos dirigidos al usuario.
 */
export function extraerCodigoError(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }

  // 1. Objeto con propiedad code/codigo
  if (typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;

    if (typeof errorObj['code'] === 'string' && errorObj['code'].trim()) {
      return errorObj['code'].trim().toUpperCase();
    }

    if (typeof errorObj['codigo'] === 'string' && errorObj['codigo'].trim()) {
      return errorObj['codigo'].trim().toUpperCase();
    }

    // Estructura anidada de contratos ErrorApi: { error: { code: string } }
    if (typeof errorObj['error'] === 'object' && errorObj['error'] !== null) {
      const anidado = errorObj['error'] as Record<string, unknown>;
      if (typeof anidado['code'] === 'string' && anidado['code'].trim()) {
        return anidado['code'].trim().toUpperCase();
      }
    }
  }

  // 2. Extraer de string o Error.message buscando nombres de error conocidos
  const texto = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (texto) {
    // Buscar coincidencia exacta o contenida con códigos conocidos
    for (const codigoConocido of Object.keys(MAPA_ERRORES_ENVIO)) {
      const regex = new RegExp(`\\b${codigoConocido}\\b`, 'i');
      if (regex.test(texto)) {
        return codigoConocido;
      }
    }

    // Buscar formato de código estándar SNAKE_CASE en mayúsculas (ej. ERROR_PERSONALIZADO_123)
    const match = texto.match(/\b([A-Z][A-Z0-9_]{3,})\b/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Traduce cualquier error ocurrido al enviar un mensaje o cotización
 * a un objeto estructurado con título, mensaje comprensible y acción sugerida en es-CO.
 *
 * El asesor NUNCA ve el código crudo en ningún campo visible (titulo, mensaje, accionSugerida, textoParaMostrar).
 */
export function interpretarErrorDeEnvio(
  error: unknown,
  fallbackPersonalizado?: Partial<DefinicionErrorEnvio>,
): DetalleErrorEnvio {
  const codigoExtraido = extraerCodigoError(error);
  const definicion = codigoExtraido ? MAPA_ERRORES_ENVIO[codigoExtraido] : undefined;

  const codigoFinal = codigoExtraido ?? 'DESCONOCIDO';
  const def = definicion ?? {
    ...FALLBACK_DESCONOCIDO,
    ...fallbackPersonalizado,
  };

  const textoParaMostrar = `${def.mensaje} ${def.accionSugerida}`.trim();

  return {
    codigo: codigoFinal,
    titulo: def.titulo,
    mensaje: def.mensaje,
    accionSugerida: def.accionSugerida,
    reintentable: def.reintentable,
    tipoAccion: def.tipoAccion,
    textoParaMostrar,
  };
}
