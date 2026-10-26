/**
 * Lógica pura para la gestión de estados de interfaz: Carga (esqueletos),
 * Vacío (ilustraciones y acciones) y Error (mensajes descriptivos y accionables).
 *
 * Tareas 0c.25 y 0c.30 — ViajaPro CRM
 * Erradica mensajes de error crudos del servidor en la interfaz del asesor.
 */

export interface MensajeErrorDetallado {
  titulo: string;
  quePaso: string;
  queHacer: string;
  esReintentable: boolean;
  codigo?: string;
}

export type CategoriaError = 'RED' | 'SESION' | 'NO_ENCONTRADO' | 'VALIDACION' | 'DESCONOCIDO';

export interface ErrorClasificado {
  categoria: CategoriaError;
  titulo: string;
  quePaso: string;
  queHacer: string;
  mensajeUsuario: string;
  esReintentable: boolean;
  codigo: string;
}

export type TipoEstadoPantalla = 'CARGA' | 'ERROR' | 'VACIO' | 'DATOS';

/**
 * Determina el estado de la pantalla en función de sus banderas reactivas.
 */
export function determinarEstadoPantalla(params: {
  cargando: boolean;
  error: unknown;
  totalElementos: number;
}): TipoEstadoPantalla {
  if (params.cargando) {
    return 'CARGA';
  }
  if (params.error) {
    return 'ERROR';
  }
  if (params.totalElementos === 0) {
    return 'VACIO';
  }
  return 'DATOS';
}

/**
 * Detecta si una cadena contiene terminología técnica de backend,
 * trazas de pila, errores SQL o JSON que nunca deben verse en UI.
 */
export function esTextoTecnico(texto: string): boolean {
  const patrones = [
    /\bat\s+.*\d+:\d+/i,
    /\(\S+:\d+:\d+\)/i,
    /postgres/i,
    /prisma/i,
    /econnrefused/i,
    /failed to fetch/i,
    /typeerror:/i,
    /syntaxerror:/i,
    /referenceerror:/i,
    /internal server error/i,
    /database error/i,
    /select\s+.*\s+from/i,
    /insert\s+into/i,
    /update\s+.*\s+set/i,
    /delete\s+from/i,
    /jwt\s+expired/i,
    /token\s+invalido/i,
    /connection pool/i,
    /fatal:/i,
    /unhandled/i,
  ];
  return patrones.some((p) => p.test(texto));
}

/**
 * Tabla de códigos de dominio prioritarios conforme a contratos y reglas de negocio (0c.30).
 */
export const TABLA_ERRORES_DOMINIO: Record<
  string,
  {
    titulo: string;
    quePaso: string;
    queHacer: string;
    categoria: CategoriaError;
    esReintentable: boolean;
  }
> = {
  SIN_VIGENCIA: {
    titulo: 'Sin vigencia de tarifas',
    quePaso: 'No existe una vigencia de tarifas aplicable para las fechas y paquete seleccionados.',
    queHacer: 'Selecciona otra fecha de salida o consulta al operador mayorista.',
    categoria: 'VALIDACION',
    esReintentable: false,
  },
  VIGENCIAS_EMPATADAS: {
    titulo: 'Vigencias superpuestas',
    quePaso: 'Existen múltiples vigencias de tarifas en conflicto para la fecha seleccionada.',
    queHacer: 'Revisa la matriz de temporadas en el catálogo o reporta la inconsistencia.',
    categoria: 'VALIDACION',
    esReintentable: false,
  },
  VENTANA_CERRADA: {
    titulo: 'Ventana de 24 horas cerrada',
    quePaso: 'Han transcurrido más de 24 horas desde el último mensaje del viajero.',
    queHacer: 'Utiliza una plantilla HSM aprobada para reiniciar la conversación.',
    categoria: 'VALIDACION',
    esReintentable: false,
  },
  CONFLICTO_VERSION: {
    titulo: 'Conflicto de versión',
    quePaso: 'La cotización fue modificada o aprobada por otro usuario simultáneamente.',
    queHacer: 'Recarga la cotización para obtener la versión más reciente.',
    categoria: 'VALIDACION',
    esReintentable: false,
  },
  PLAZAS_INSUFICIENTES: {
    titulo: 'Plazas insuficientes',
    quePaso: 'No hay cupos disponibles para el número de pasajeros y acomodación elegidos.',
    queHacer: 'Ajusta la cantidad de pasajeros o cambia de paquete o acomodación.',
    categoria: 'VALIDACION',
    esReintentable: false,
  },
  CONTACTO_NO_ENCONTRADO: {
    titulo: 'Contacto no encontrado',
    quePaso: 'El contacto solicitado no existe o pertenece a otro asesor.',
    queHacer: 'Verifica los datos en el directorio de contactos.',
    categoria: 'NO_ENCONTRADO',
    esReintentable: false,
  },
  OPORTUNIDAD_NO_ENCONTRADA: {
    titulo: 'Oportunidad no encontrada',
    quePaso: 'La oportunidad solicitada no existe o fue archivada.',
    queHacer: 'Regresa al tablero del pipeline para verificar las oportunidades activas.',
    categoria: 'NO_ENCONTRADO',
    esReintentable: false,
  },
  COTIZACION_NO_ENCONTRADA: {
    titulo: 'Cotización no encontrada',
    quePaso: 'La cotización solicitada no existe o fue eliminada.',
    queHacer: 'Regresa al listado de cotizaciones para consultar las versiones disponibles.',
    categoria: 'NO_ENCONTRADO',
    esReintentable: false,
  },
};

/**
 * Clasifica cualquier error en categorías legibles (RED, SESION, NO_ENCONTRADO, VALIDACION, DESCONOCIDO)
 * y devuelve explicaciones en español orientadas al asesor de agencia.
 * El mensaje crudo se delega exclusivamente a console.error (0c.30).
 */
export function clasificarError(error: unknown): ErrorClasificado {
  if (typeof console !== 'undefined' && console.error) {
    console.error('[ErrorSistema - Mensaje Crudo]:', error);
  }

  const errorObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const rawCode = errorObj?.code ?? errorObj?.codigo;
  const codigoDominio = typeof rawCode === 'string' ? rawCode : '';
  const statusHttp = typeof errorObj?.status === 'number' ? errorObj.status : 0;

  const crudo =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof errorObj?.message === 'string'
          ? errorObj.message
          : 'Inconveniente inesperado';

  const texto = crudo.toLowerCase();
  const esMensajeHumano = !esTextoTecnico(crudo) && crudo.trim().length > 5;

  // 1. Tabla de códigos de dominio prioritarios (SIN_VIGENCIA, VIGENCIAS_EMPATADAS, etc.)
  if (codigoDominio) {
    const codUpper = codigoDominio.toUpperCase();
    const mapeoDominio = TABLA_ERRORES_DOMINIO[codUpper];
    if (mapeoDominio) {
      const mensajeFinal = esMensajeHumano ? crudo : mapeoDominio.quePaso;
      return {
        ...mapeoDominio,
        quePaso: mensajeFinal,
        mensajeUsuario: mensajeFinal,
        codigo: codUpper,
      };
    }

    // Sesión o autorización por código o HTTP 401/403
    if (
      codUpper === 'SIN_SESION' ||
      codUpper === 'UNAUTHORIZED' ||
      codUpper === 'CONFIG_TENANT_FALTANTE' ||
      codUpper === 'TOKEN_EXPIRADO' ||
      codUpper === 'NO_AUTORIZADO' ||
      statusHttp === 401 ||
      statusHttp === 403
    ) {
      const msg = esMensajeHumano
        ? crudo
        : 'Sesión expirada o configuración requerida. Por favor inicia sesión nuevamente.';
      return {
        categoria: 'SESION',
        titulo: 'Sesión o configuración requerida',
        quePaso: esMensajeHumano
          ? crudo
          : 'Tu sesión no es válida, ha expirado o el espacio de trabajo de la agencia no está configurado.',
        queHacer: 'Inicia sesión de nuevo o revisa las credenciales de la agencia.',
        mensajeUsuario: msg,
        esReintentable: true,
        codigo: codUpper || 'ERROR_AUTORIZACION',
      };
    }

    // No encontrado por código o HTTP 404
    if (
      codUpper.includes('NO_ENCONTRAD') ||
      codUpper === 'NOT_FOUND' ||
      codUpper === 'RECURSO_INEXISTENTE' ||
      statusHttp === 404
    ) {
      const msg = esMensajeHumano
        ? crudo
        : 'El recurso solicitado no fue encontrado o ya no está disponible.';
      return {
        categoria: 'NO_ENCONTRADO',
        titulo: 'Recurso no disponible',
        quePaso: esMensajeHumano
          ? crudo
          : 'El elemento consultado no existe, fue eliminado o se encuentra archivado.',
        queHacer: 'Verifica el identificador o regresa al listado principal.',
        mensajeUsuario: msg,
        esReintentable: false,
        codigo: codUpper || 'ERROR_NO_ENCONTRADO',
      };
    }

    // Red / Conexión por código o HTTP 0
    if (
      codUpper === 'ERROR_CONEXION' ||
      codUpper === 'ERROR_RED' ||
      codUpper === 'FALLO_CONEXION' ||
      codUpper === 'TIMEOUT' ||
      statusHttp === 0
    ) {
      return {
        categoria: 'RED',
        titulo: 'Sin conexión con el servidor',
        quePaso:
          'No se pudo establecer comunicación con el servidor debido a una interrupción en tu red o en el servicio.',
        queHacer: 'Verifica tu conexión a internet y pulsa Reintentar.',
        mensajeUsuario: 'Sin conexión con el servidor. Comprueba tu red e intenta nuevamente.',
        esReintentable: true,
        codigo: codUpper || 'ERROR_RED',
      };
    }

    // Conflicto de versión o regla de negocio (HTTP 409)
    if (statusHttp === 409 || codUpper.includes('CONFLICTO')) {
      const msg = esMensajeHumano
        ? crudo
        : 'La operación presenta un conflicto con el estado actual del registro.';
      return {
        categoria: 'VALIDACION',
        titulo: 'Conflicto en la operación',
        quePaso: msg,
        queHacer: 'Recarga los datos para verificar el estado más reciente de la operación.',
        mensajeUsuario: msg,
        esReintentable: false,
        codigo: codUpper || 'ERROR_CONFLICTO_409',
      };
    }

    // Validación general (HTTP 400 o código de validación)
    if (
      codUpper.includes('VALIDACION') ||
      codUpper === 'VALOR_INVALIDO' ||
      codUpper === 'SOLICITUD_INVALIDA' ||
      statusHttp === 400
    ) {
      const msg = esMensajeHumano
        ? crudo
        : 'Los datos suministrados no son válidos o entraron en conflicto.';
      return {
        categoria: 'VALIDACION',
        titulo: 'Datos no válidos o conflicto comercial',
        quePaso: esMensajeHumano
          ? crudo
          : 'La solicitud no cumple con los contratos o reglas comerciales requeridas.',
        queHacer:
          'Revisa los campos del formulario y verifica que los datos cumplan las condiciones.',
        mensajeUsuario: msg,
        esReintentable: false,
        codigo: codUpper || 'ERROR_VALIDACION',
      };
    }
  }

  // Si el objeto de error tiene status 409 aunque no tenga code
  if (statusHttp === 409) {
    const msg = esMensajeHumano
      ? crudo
      : 'La operación presenta un conflicto con el estado actual del registro.';
    return {
      categoria: 'VALIDACION',
      titulo: 'Conflicto en la operación',
      quePaso: msg,
      queHacer: 'Recarga los datos para verificar el estado más reciente de la operación.',
      mensajeUsuario: msg,
      esReintentable: false,
      codigo: 'ERROR_CONFLICTO_409',
    };
  }

  // 2. Errores de Red (prioridad sobre texto libre)
  if (
    texto.includes('failed to fetch') ||
    texto.includes('econnrefused') ||
    texto.includes('offline') ||
    texto.includes('timeout') ||
    texto.includes('network')
  ) {
    return {
      categoria: 'RED',
      titulo: 'Sin conexión con el servidor',
      quePaso:
        'No se pudo establecer comunicación con el servidor debido a una interrupción en tu red o en el servicio.',
      queHacer: 'Verifica tu conexión a internet y pulsa Reintentar.',
      mensajeUsuario: 'Sin conexión con el servidor. Comprueba tu red e intenta nuevamente.',
      esReintentable: true,
      codigo: 'ERROR_RED',
    };
  }

  // 3. Errores de Sesión o Tenant
  if (
    texto.includes('unauthorized') ||
    texto.includes('401') ||
    texto.includes('forbidden') ||
    texto.includes('403') ||
    texto.includes('tenant') ||
    texto.includes('sesion') ||
    texto.includes('sesión') ||
    texto.includes('sin_sesion')
  ) {
    return {
      categoria: 'SESION',
      titulo: 'Sesión o configuración requerida',
      quePaso:
        'Tu sesión no es válida, ha expirado o el espacio de trabajo de la agencia no está configurado.',
      queHacer: 'Inicia sesión de nuevo o revisa las credenciales de la agencia.',
      mensajeUsuario:
        'Sesión expirada o configuración requerida. Por favor inicia sesión nuevamente.',
      esReintentable: true,
      codigo: 'ERROR_AUTORIZACION',
    };
  }

  // 4. Errores explícitos de validación (400, zod, formulario)
  if (texto.includes('400') || texto.includes('validation') || texto.includes('validación')) {
    return {
      categoria: 'VALIDACION',
      titulo: 'Datos inconsistentes o inválidos',
      quePaso:
        'Los datos enviados no cumplen con las reglas comerciales requeridas para la solicitud.',
      queHacer: 'Revisa los campos del formulario, corrige la información y vuelve a intentar.',
      mensajeUsuario:
        'Los datos suministrados no son válidos o presentan un conflicto. Revisa los campos e intenta nuevamente.',
      esReintentable: false,
      codigo: 'ERROR_VALIDACION',
    };
  }

  // 5. Conflicto de versión / 409 en mensaje
  if (texto.includes('409') || texto.includes('conflicto')) {
    const msg = esMensajeHumano
      ? crudo
      : 'La operación presenta un conflicto con el estado actual del registro.';
    return {
      categoria: 'VALIDACION',
      titulo: 'Conflicto en la operación',
      quePaso: msg,
      queHacer: 'Recarga los datos para verificar el estado más reciente de la operación.',
      mensajeUsuario: msg,
      esReintentable: false,
      codigo: 'ERROR_CONFLICTO_409',
    };
  }

  // 6. No encontrado (404)
  if (
    texto.includes('404') ||
    texto.includes('not found') ||
    texto.includes('no encontrada') ||
    texto.includes('no existe') ||
    texto.includes('_no_encontrada')
  ) {
    return {
      categoria: 'NO_ENCONTRADO',
      titulo: 'Recurso no disponible',
      quePaso: 'El elemento consultado no existe, fue eliminado o se encuentra archivado.',
      queHacer: 'Verifica el identificador o regresa al listado principal.',
      mensajeUsuario: 'El recurso solicitado no fue encontrado o ya no está disponible.',
      esReintentable: false,
      codigo: 'ERROR_NO_ENCONTRADO',
    };
  }

  // 7. Errores de dominio ya redactados para humanos vs errores técnicos (500)
  if (!esTextoTecnico(crudo) && crudo.length > 10 && crudo.length < 250) {
    return {
      categoria: 'DESCONOCIDO',
      titulo: 'Inconveniente comercial',
      quePaso: crudo,
      queHacer: 'Verifica los parámetros de la operación o solicita asistencia a tu supervisor.',
      mensajeUsuario: crudo,
      esReintentable: true,
      codigo: 'ERROR_DOMINIO',
    };
  }

  // Error técnico / 500 / desconocido
  return {
    categoria: 'DESCONOCIDO',
    titulo: 'Error del servidor al procesar la solicitud',
    quePaso:
      'El servidor experimentó un inconveniente temporal y no pudo completar la operación solicitada.',
    queHacer: 'Espera unos momentos y pulsa Reintentar. Si el error persiste, contacta a soporte.',
    mensajeUsuario:
      'El servidor no pudo procesar la solicitud en este momento. Por favor reintenta en unos instantes.',
    esReintentable: true,
    codigo: 'ERROR_SERVIDOR',
  };
}

export function formatearErrorAmigable(error: unknown, fallback?: string): string {
  const clasificado = clasificarError(error);
  if (
    clasificado.categoria === 'DESCONOCIDO' &&
    fallback &&
    esTextoTecnico(error instanceof Error ? error.message : '')
  ) {
    return fallback;
  }
  return clasificado.mensajeUsuario;
}

/**
 * Convierte cualquier error en una estructura accionable que especifica
 * qué pasó y qué debe hacer el usuario, erradicando mensajes genéricos y crudos.
 */
export function construirMensajeErrorAccionable(
  error: unknown,
  contexto:
    | 'BANDEJA_CONVERSACION'
    | 'PIPELINE_TABLERO'
    | 'CATALOGO_SALIDAS'
    | 'CONTACTOS_LISTA'
    | 'CONFIGURACION_AGENCIA'
    | 'EXPEDIENTES_VIAJE'
    | 'REPORTES_VENTAS'
    | 'COTIZACIONES_LISTA',
): MensajeErrorDetallado {
  const clasificado = clasificarError(error);

  // Si ya es un error clasificado de red o sesión, priorizarlo
  if (clasificado.categoria === 'RED' || clasificado.categoria === 'SESION') {
    return {
      titulo: clasificado.titulo,
      quePaso: clasificado.quePaso,
      queHacer: clasificado.queHacer,
      esReintentable: clasificado.esReintentable,
      codigo: clasificado.codigo,
    };
  }

  // Errores contextuales por módulo con lenguaje de producto limpio
  switch (contexto) {
    case 'BANDEJA_CONVERSACION':
      return {
        titulo: 'No se pudo cargar la conversación',
        quePaso:
          clasificado.categoria === 'NO_ENCONTRADO'
            ? 'El hilo de conversación solicitado no existe o fue archivado por otro asesor.'
            : clasificado.quePaso,
        queHacer:
          'Regresa a la lista de mensajes o solicita una nueva sincronización pulsando Reintentar.',
        esReintentable: true,
        codigo: 'ERROR_CONVERSACION',
      };

    case 'PIPELINE_TABLERO':
      return {
        titulo: 'Error al sincronizar el tablero de ventas',
        quePaso: `No fue posible sincronizar las etapas y oportunidades del CRM: ${clasificado.quePaso}`,
        queHacer: 'Prueba cambiar a modo demostración o reintentar la conexión con la API de CRM.',
        esReintentable: true,
        codigo: 'ERROR_PIPELINE',
      };

    case 'CATALOGO_SALIDAS':
      return {
        titulo: 'No se pudieron obtener las salidas del catálogo',
        quePaso: `La consulta al tarifario comercial no pudo completarse: ${clasificado.quePaso}`,
        queHacer:
          'Comprueba los filtros seleccionados o pulsa Reintentar para solicitar las vigencias nuevamente.',
        esReintentable: true,
        codigo: 'ERROR_CATALOGO',
      };

    case 'CONTACTOS_LISTA':
      return {
        titulo: 'Error al cargar el directorio de contactos',
        quePaso: `No se pudo obtener el listado de viajeros y clientes: ${clasificado.quePaso}`,
        queHacer: 'Comprueba los permisos de acceso al CRM o reintenta la sincronización.',
        esReintentable: true,
        codigo: 'ERROR_CONTACTOS',
      };

    case 'CONFIGURACION_AGENCIA':
      return {
        titulo: 'Error al actualizar la configuración',
        quePaso: `La validación de parámetros de la agencia rechazó los datos: ${clasificado.quePaso}`,
        queHacer: 'Revisa los campos señalados en rojo, ajusta los valores y vuelve a guardar.',
        esReintentable: false,
        codigo: 'ERROR_CONFIGURACION',
      };

    case 'EXPEDIENTES_VIAJE':
      return {
        titulo: 'No se pudo acceder al expediente operativo',
        quePaso: `El expediente de viaje no pudo ser recuperado: ${clasificado.quePaso}`,
        queHacer:
          'Verifica el código del localizador en el buscador o contacta al área de operaciones.',
        esReintentable: true,
        codigo: 'ERROR_EXPEDIENTE',
      };

    case 'REPORTES_VENTAS':
      return {
        titulo: 'Error al calcular métricas de rendimiento',
        quePaso: `No fue posible procesar los datos de ventas: ${clasificado.quePaso}`,
        queHacer: 'Selecciona un rango de fechas diferente o reintenta el cálculo.',
        esReintentable: true,
        codigo: 'ERROR_REPORTES',
      };

    case 'COTIZACIONES_LISTA':
      return {
        titulo: 'No se pudo obtener el listado de cotizaciones',
        quePaso: `La consulta al repositorio de cotizaciones falló: ${clasificado.quePaso}`,
        queHacer:
          'Pulsa Reintentar para volver a consultar o utiliza el cotizador para emitir una nueva.',
        esReintentable: true,
        codigo: 'ERROR_COTIZACIONES',
      };
  }
}

/**
 * Valida que un mensaje de error no sea genérico ni exponga texto técnico.
 */
export function esMensajeErrorValido(msg: MensajeErrorDetallado): boolean {
  if (!msg.titulo || msg.titulo.trim().length < 5) return false;
  if (!msg.quePaso || msg.quePaso.trim().length < 10) return false;
  if (!msg.queHacer || msg.queHacer.trim().length < 10) return false;

  const noGenericos = ['error', 'algo salió mal', 'ocurrió un error', 'falló'];
  const esGenerico = noGenericos.includes(msg.titulo.trim().toLowerCase());
  const contieneTecnico = esTextoTecnico(msg.quePaso) || esTextoTecnico(msg.titulo);

  return !esGenerico && !contieneTecnico;
}
