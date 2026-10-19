/**
 * Lógica pura para la gestión de estados de interfaz: Carga (esqueletos),
 * Vacío (ilustraciones y acciones) y Error (mensajes descriptivos y accionables).
 *
 * Tarea 0c.25 — ViajaPro CRM
 */

export interface MensajeErrorDetallado {
  titulo: string;
  quePaso: string;
  queHacer: string;
  esReintentable: boolean;
  codigo?: string;
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
 * Convierte cualquier error en una estructura accionable que especifica
 * qué pasó y qué debe hacer el usuario, erradicando mensajes genéricos.
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
  const mensajeBase =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Fallo de comunicación desconocido';

  // Detección de problemas de red o conexión
  if (
    mensajeBase.toLowerCase().includes('network') ||
    mensajeBase.toLowerCase().includes('failed to fetch') ||
    mensajeBase.toLowerCase().includes('econnrefused') ||
    mensajeBase.toLowerCase().includes('offline')
  ) {
    return {
      titulo: 'Sin conexión con el servidor',
      quePaso: `No se pudo conectar con el servicio de ${obtenerNombreModulo(contexto)} debido a una interrupción de red.`,
      queHacer:
        'Verifica tu conexión a internet o la disponibilidad del servicio y pulsa en Reintentar.',
      esReintentable: true,
      codigo: 'ERROR_RED',
    };
  }

  // Detección de falta de sesión o tenant
  if (
    mensajeBase.toLowerCase().includes('tenant') ||
    mensajeBase.toLowerCase().includes('sesión') ||
    mensajeBase.toLowerCase().includes('sesion') ||
    mensajeBase.toLowerCase().includes('401')
  ) {
    return {
      titulo: 'Configuración o sesión de agencia requerida',
      quePaso: `La sesión o el identificador de la agencia no son válidos para ${obtenerNombreModulo(contexto)}.`,
      queHacer:
        'Verifica el archivo de configuración .env (NEXT_PUBLIC_DEV_TENANT_ID) o inicia sesión nuevamente.',
      esReintentable: true,
      codigo: 'ERROR_AUTORIZACION',
    };
  }

  // Errores específicos por módulo
  switch (contexto) {
    case 'BANDEJA_CONVERSACION':
      return {
        titulo: 'No se pudo cargar la conversación',
        quePaso: mensajeBase.includes('no encontrada')
          ? 'El hilo de conversación solicitado no existe o fue archivado por otro asesor.'
          : `Ocurrió un inconveniente al consultar los mensajes: ${mensajeBase}`,
        queHacer:
          'Regresa a la lista de mensajes o solicita una nueva sincronización pulsando Reintentar.',
        esReintentable: true,
        codigo: 'ERROR_CONVERSACION',
      };

    case 'PIPELINE_TABLERO':
      return {
        titulo: 'Error al sincronizar el tablero de ventas',
        quePaso: `No fue posible cargar las etapas y oportunidades del CRM: ${mensajeBase}`,
        queHacer: 'Prueba cambiar a modo demostración o reintentar la conexión con la API de CRM.',
        esReintentable: true,
        codigo: 'ERROR_PIPELINE',
      };

    case 'CATALOGO_SALIDAS':
      return {
        titulo: 'No se pudieron obtener las salidas del catálogo',
        quePaso: `La consulta al tarifario comercial no pudo completarse: ${mensajeBase}`,
        queHacer:
          'Comprueba los filtros seleccionados o pulsa Reintentar para solicitar las vigencias nuevamente.',
        esReintentable: true,
        codigo: 'ERROR_CATALOGO',
      };

    case 'CONTACTOS_LISTA':
      return {
        titulo: 'Error al cargar el directorio de contactos',
        quePaso: `No se pudo obtener el listado de viajeros y clientes: ${mensajeBase}`,
        queHacer: 'Comprueba los permisos de acceso al CRM o reintenta la sincronización.',
        esReintentable: true,
        codigo: 'ERROR_CONTACTOS',
      };

    case 'CONFIGURACION_AGENCIA':
      return {
        titulo: 'Error al actualizar la configuración',
        quePaso: `La validación de parámetros de la agencia rechazó los datos: ${mensajeBase}`,
        queHacer: 'Revisa los campos señalados en rojo, ajusta los valores y vuelve a guardar.',
        esReintentable: false,
        codigo: 'ERROR_CONFIGURACION',
      };

    case 'EXPEDIENTES_VIAJE':
      return {
        titulo: 'No se pudo acceder al expediente operativo',
        quePaso: `El expediente de viaje no pudo ser recuperado o contiene inconsistencias: ${mensajeBase}`,
        queHacer:
          'Verifica el código del localizador en el buscador o contacta al área de operaciones.',
        esReintentable: true,
        codigo: 'ERROR_EXPEDIENTE',
      };

    case 'REPORTES_VENTAS':
      return {
        titulo: 'Error al calcular métricas de rendimiento',
        quePaso: `No fue posible procesar los datos de ventas para el período seleccionado: ${mensajeBase}`,
        queHacer: 'Selecciona un rango de fechas diferente o reintenta el cálculo.',
        esReintentable: true,
        codigo: 'ERROR_REPORTES',
      };

    case 'COTIZACIONES_LISTA':
      return {
        titulo: 'No se pudo obtener el listado de cotizaciones',
        quePaso: `La consulta al repositorio de cotizaciones falló: ${mensajeBase}`,
        queHacer:
          'Pulsa Reintentar para volver a consultar o utiliza el cotizador para emitir una nueva.',
        esReintentable: true,
        codigo: 'ERROR_COTIZACIONES',
      };
  }
}

function obtenerNombreModulo(contexto: string): string {
  switch (contexto) {
    case 'BANDEJA_CONVERSACION':
      return 'Bandeja de Entrada';
    case 'PIPELINE_TABLERO':
      return 'Pipeline de Oportunidades';
    case 'CATALOGO_SALIDAS':
      return 'Catálogo de Salidas';
    case 'CONTACTOS_LISTA':
      return 'Directorio de Contactos';
    case 'CONFIGURACION_AGENCIA':
      return 'Configuración de Agencia';
    case 'EXPEDIENTES_VIAJE':
      return 'Expedientes de Viaje';
    case 'REPORTES_VENTAS':
      return 'Reportes y Métricas';
    case 'COTIZACIONES_LISTA':
      return 'Listado de Cotizaciones';
    default:
      return 'Módulo Comercial';
  }
}

/**
 * Valida que un mensaje de error no sea genérico (debe contener explicación y qué hacer).
 */
export function esMensajeErrorValido(msg: MensajeErrorDetallado): boolean {
  if (!msg.titulo || msg.titulo.trim().length < 5) return false;
  if (!msg.quePaso || msg.quePaso.trim().length < 10) return false;
  if (!msg.queHacer || msg.queHacer.trim().length < 10) return false;

  const noGenericos = ['error', 'algo salió mal', 'ocurrió un error', 'falló'];
  const esGenerico = noGenericos.includes(msg.titulo.trim().toLowerCase());
  return !esGenerico;
}
