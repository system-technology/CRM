/**
 * Clasificación y manejo de estados de error del sistema (T-109).
 *
 * Proporciona mensajes claros, respetuosos y en español colombiano para agencias de viajes,
 * clasificando fallos en 404 (No encontrado), 401 (Sesión expirada), 403 (Acceso denegado),
 * sin conexión (offline/network) y errores de servidor (500), garantizando que nunca
 * se filtren trazas de pila (stack traces) ni secretos (R6).
 */

export type TipoErrorSistema =
  | 'NO_ENCONTRADO'
  | 'SESION_EXPIRADA'
  | 'ACCESO_DENEGADO'
  | 'SIN_CONEXION'
  | 'ERROR_SERVIDOR'
  | 'ERROR_DESCONOCIDO';

export interface InfoErrorSistema {
  tipo: TipoErrorSistema;
  titulo: string;
  mensaje: string;
  sugerencia: string;
  codigo: string;
  puedeReintentar: boolean;
  redireccionSugerida?: string;
  accionTexto: string;
  accionHref?: string;
}

/**
 * Determina si un error corresponde a la pérdida total de conexión con la red.
 */
export function esErrorSinConexion(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (!error) return false;

  if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('connection refused') ||
      msg.includes('econnrefused') ||
      msg.includes('offline') ||
      msg.includes('timeout')
    );
  }

  if (typeof error === 'object' && error !== null) {
    const codigo = (error as { code?: string; status?: number }).code;
    if (codigo === 'ECONNREFUSED' || codigo === 'ETIMEDOUT' || codigo === 'ENOTFOUND') {
      return true;
    }
  }

  return false;
}

/**
 * Determina si un error representa una sesión expirada o no autorizada (401).
 */
export function esErrorSesionExpirada(error: unknown, status?: number): boolean {
  if (status === 401) return true;
  if (!error) return false;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('unauthorized') ||
      msg.includes('no autorizado') ||
      msg.includes('sesión expirada') ||
      msg.includes('sesion expirada') ||
      msg.includes('token_invalido') ||
      msg.includes('jwt expired')
    );
  }

  if (typeof error === 'object' && error !== null) {
    const statusObj =
      (error as { status?: number; statusCode?: number }).status ??
      (error as { statusCode?: number }).statusCode;
    if (statusObj === 401) return true;

    const codigo =
      (error as { codigo?: string; code?: string }).codigo ?? (error as { code?: string }).code;
    if (codigo === 'NO_AUTENTICADO' || codigo === 'SESION_EXPIRADA' || codigo === 'UNAUTHORIZED') {
      return true;
    }
  }

  return false;
}

/**
 * Determina si un error es un 404 (Recurso o ruta no encontrada).
 */
export function esErrorNoEncontrado(error: unknown, status?: number): boolean {
  if (status === 404) return true;
  if (!error) return false;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('not found') || msg.includes('no encontrado') || msg.includes('404');
  }

  if (typeof error === 'object' && error !== null) {
    const statusObj =
      (error as { status?: number; statusCode?: number }).status ??
      (error as { statusCode?: number }).statusCode;
    if (statusObj === 404) return true;

    const codigo =
      (error as { codigo?: string; code?: string }).codigo ?? (error as { code?: string }).code;
    if (codigo === 'NO_ENCONTRADO' || codigo === 'NOT_FOUND') {
      return true;
    }
  }

  return false;
}

/**
 * Construye una URL segura para redirigir a /ingresar conservando el destino actual.
 * Evita ataques de redirección abierta exigiendo rutas relativas que inicien con `/`
 * y no con `//` ni protocolos externos.
 */
export function construirUrlRedireccionIngreso(
  rutaActual?: string,
  motivo = 'sesion_expirada',
): string {
  const base = '/ingresar';
  if (!rutaActual) {
    return `${base}?motivo=${encodeURIComponent(motivo)}`;
  }

  // Sanitización de seguridad contra open redirects
  const esRutaRelativaSegura =
    rutaActual.startsWith('/') && !rutaActual.startsWith('//') && !rutaActual.includes('://');

  if (!esRutaRelativaSegura || rutaActual === '/ingresar' || rutaActual === '/iniciar-sesion') {
    return `${base}?motivo=${encodeURIComponent(motivo)}`;
  }

  return `${base}?redirigir=${encodeURIComponent(rutaActual)}&motivo=${encodeURIComponent(motivo)}`;
}

/**
 * Extrae una ruta de destino segura desde el parámetro 'redirigir'.
 */
export function sanitizarRutaRedireccion(
  paramRedirigir: string | null | undefined,
  fallback = '/bandeja',
): string {
  if (!paramRedirigir) return fallback;

  const ruta = paramRedirigir.trim();
  const esSegura =
    ruta.startsWith('/') &&
    !ruta.startsWith('//') &&
    !ruta.includes('://') &&
    ruta !== '/ingresar' &&
    ruta !== '/iniciar-sesion';

  return esSegura ? ruta : fallback;
}

/**
 * Clasifica cualquier error capturado por React Error Boundaries, peticiones HTTP o excepciones de runtime.
 */
export function clasificarErrorSistema(
  error: unknown,
  status?: number,
  rutaActual?: string,
): InfoErrorSistema {
  // 1. Sin Conexión
  if (esErrorSinConexion(error)) {
    return {
      tipo: 'SIN_CONEXION',
      titulo: 'Sin conexión a internet',
      mensaje:
        'No pudimos comunicarnos con el servidor de ViajaPro. Revisa tu conexión wifi o datos móviles para continuar gestionando tus viajes.',
      sugerencia: 'Una vez recuperes la señal, pulsa «Reintentar» o recarga la página.',
      codigo: 'RED_SIN_CONEXION',
      puedeReintentar: true,
      accionTexto: 'Reintentar conexión',
    };
  }

  // 2. Sesión Expirada (401)
  if (esErrorSesionExpirada(error, status)) {
    const urlIngreso = construirUrlRedireccionIngreso(rutaActual, 'sesion_expirada');
    return {
      tipo: 'SESION_EXPIRADA',
      titulo: 'Tu sesión ha expirado',
      mensaje:
        'Por seguridad de tu agencia y protección de los datos de tus viajeros, la sesión caduca tras un período de inactividad.',
      sugerencia: 'Inicia sesión de nuevo para retomar exactamente donde estabas.',
      codigo: 'AUTH_SESION_EXPIRADA',
      puedeReintentar: false,
      redireccionSugerida: urlIngreso,
      accionTexto: 'Iniciar Sesión',
      accionHref: urlIngreso,
    };
  }

  // 3. Acceso Denegado (403)
  if (
    status === 403 ||
    (error instanceof Error && error.message.toLowerCase().includes('forbidden'))
  ) {
    return {
      tipo: 'ACCESO_DENEGADO',
      titulo: 'Acceso no autorizado',
      mensaje:
        'Tu usuario no cuenta con los permisos necesarios en este tenant para ver esta información o realizar esta acción (R1).',
      sugerencia:
        'Solicita al administrador de tu agencia que asigne el rol o permiso correspondiente.',
      codigo: 'AUTH_ACCESO_DENEGADO',
      puedeReintentar: false,
      accionTexto: 'Ir a la Bandeja',
      accionHref: '/bandeja',
    };
  }

  // 4. No Encontrado (404)
  if (esErrorNoEncontrado(error, status)) {
    return {
      tipo: 'NO_ENCONTRADO',
      titulo: 'Destino no encontrado',
      mensaje:
        'La página, cotización o recurso que buscas ha cambiado de rumbo, fue archivado o la dirección no es correcta.',
      sugerencia: 'Verifica la URL o regresa a tus cotizaciones o a la bandeja principal.',
      codigo: 'HTTP_404_NOT_FOUND',
      puedeReintentar: false,
      accionTexto: 'Volver a la Bandeja',
      accionHref: '/bandeja',
    };
  }

  // 5. Error de Servidor (500 / 502 / 503 / 504)
  const es5xx =
    (status !== undefined && status >= 500 && status <= 599) ||
    (typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number' &&
      error.status >= 500);

  if (es5xx) {
    return {
      tipo: 'ERROR_SERVIDOR',
      titulo: 'Fallo temporal en el servidor',
      mensaje:
        'Nuestros servidores de turismo presentaron un contratiempo temporal al procesar la solicitud.',
      sugerencia: 'No perdiste tus datos guardados. Intenta pulsar «Reintentar» en unos instantes.',
      codigo: status ? `HTTP_${status}_SERVER_ERROR` : 'HTTP_500_SERVER_ERROR',
      puedeReintentar: true,
      accionTexto: 'Reintentar',
    };
  }

  // 6. Error Desconocido / Genérico
  return {
    tipo: 'ERROR_DESCONOCIDO',
    titulo: 'Ocurrió un contratiempo inesperado',
    mensaje:
      'Se presentó un fallo imprevisto en la aplicación. Nuestro equipo técnico ha sido notificado automáticamente para solucionarlo.',
    sugerencia: 'Puedes intentar reintentar la acción o regresar al panel principal de tu agencia.',
    codigo: 'SISTEMA_ERROR_INESPERADO',
    puedeReintentar: true,
    accionTexto: 'Reintentar',
  };
}
