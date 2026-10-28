/**
 * Módulo de Lógica para Respuestas Rápidas (Canned Responses) en la Bandeja y Configuración
 *
 * T-104: Respuestas rápidas en la bandeja: lista, insertar con «/» y administración por agencia
 * Cumple con R8 (sin floats), R9 (UTC en marcas de tiempo), R10 (datos de viajero no expuestos)
 * y arquitectura limpia sin acoplamiento a frameworks.
 */

export type CategoriaRespuestaRapida = 'general' | 'cotizaciones' | 'pagos' | 'operaciones';

export interface RespuestaRapida {
  id: string;
  atajo: string; // ej. "saludo", "cuenta", "requisitos", "horario", "seguimiento"
  titulo: string;
  contenido: string; // texto con plantillas {nombre}, {asesor}, {agencia}, {destino}
  categoria: CategoriaRespuestaRapida;
  agenciaId?: string | undefined;
  actualizadoEn?: string | undefined;
}

export interface ContextoInterpolacion {
  nombreCliente?: string | null | undefined;
  nombreAsesor?: string | null | undefined;
  nombreAgencia?: string | null | undefined;
  destino?: string | null | undefined;
}

export interface DisparadorSlashDetectado {
  activo: boolean;
  query: string;
  indiceInicio: number;
  longitudComando: number;
}

export const CATEGORIAS_RESPUESTA_RAPIDA: Array<{
  id: CategoriaRespuestaRapida;
  etiqueta: string;
  icono: string;
}> = [
  { id: 'general', etiqueta: 'General y Cortesía', icono: '💬' },
  { id: 'cotizaciones', etiqueta: 'Cotizaciones y Propuestas', icono: '📄' },
  { id: 'pagos', etiqueta: 'Pagos y Bancos COP', icono: '💳' },
  { id: 'operaciones', etiqueta: 'Operaciones y Requisitos', icono: '✈️' },
];

export const RESPUESTAS_RAPIDAS_POR_DEFECTO: RespuestaRapida[] = [
  {
    id: 'rr-saludo-inicial',
    atajo: 'saludo',
    titulo: 'Saludo inicial cordial',
    categoria: 'general',
    contenido:
      '¡Hola {nombre}! Con gusto te saluda {asesor} de {agencia}. ¿En qué podemos asesorarte el día de hoy para tu próximo viaje?',
    actualizadoEn: '2026-10-28T12:00:00.000Z',
  },
  {
    id: 'rr-cuenta-bancaria',
    atajo: 'cuenta',
    titulo: 'Datos de cuenta bancaria (COP)',
    categoria: 'pagos',
    contenido:
      'Para formalizar tu reserva, puedes realizar la transferencia en pesos colombianos (COP) a la cuenta de ahorros de {agencia}. Recuerda enviarnos el soporte por este medio para validar tu pago.',
    actualizadoEn: '2026-10-28T12:00:00.000Z',
  },
  {
    id: 'rr-requisitos-viaje',
    atajo: 'requisitos',
    titulo: 'Requisitos de viaje y documentos',
    categoria: 'operaciones',
    contenido:
      'Estimado/a {nombre}, para garantizar tu emisión hacia {destino} requerimos: documento de identidad vigente (o pasaporte con vigencia mínima de 6 meses para destinos internacionales), nombres completos de los pasajeros y contacto de emergencia.',
    actualizadoEn: '2026-10-28T12:00:00.000Z',
  },
  {
    id: 'rr-horario-atencion',
    atajo: 'horario',
    titulo: 'Horarios de atención de la agencia',
    categoria: 'general',
    contenido:
      'En {agencia} nuestro horario de atención es de lunes a viernes de 8:00 a.m. a 6:00 p.m. y sábados de 9:00 a.m. a 1:00 p.m. Si nos escribes fuera de este horario, responderemos a primera hora del siguiente día hábil.',
    actualizadoEn: '2026-10-28T12:00:00.000Z',
  },
  {
    id: 'rr-seguimiento-cotizacion',
    atajo: 'seguimiento',
    titulo: 'Seguimiento a cotización enviada',
    categoria: 'cotizaciones',
    contenido:
      'Hola {nombre}, te saluda {asesor}. Quería consultar si tuviste oportunidad de revisar la propuesta para {destino}. ¿Deseas hacer algún cambio en fechas, itinerario o número de pasajeros?',
    actualizadoEn: '2026-10-28T12:00:00.000Z',
  },
  {
    id: 'rr-despedida-cierre',
    atajo: 'despedida',
    titulo: 'Despedida cordial de cierre',
    categoria: 'general',
    contenido:
      '¡Ha sido un placer atenderte, {nombre}! En {agencia} quedamos a tu completa disposición para hacer realidad tu experiencia de viaje. ¡Que tengas un excelente día!',
    actualizadoEn: '2026-10-28T12:00:00.000Z',
  },
];

/**
 * Reemplaza variables contextuales con valores seguros o sustitutos amigables.
 * Evita inyección o valores nulos/indefinidos en el texto final.
 */
export function interpolarVariables(texto: string, contexto: ContextoInterpolacion = {}): string {
  const nombreCliente = contexto.nombreCliente?.trim() || 'estimado/a viajero/a';
  const nombreAsesor = contexto.nombreAsesor?.trim() || 'tu asesor de viajes';
  const nombreAgencia = contexto.nombreAgencia?.trim() || 'nuestra agencia';
  const destino = contexto.destino?.trim() || 'tu destino';

  return texto
    .replace(/\{nombre\}/gi, nombreCliente)
    .replace(/\{asesor\}/gi, nombreAsesor)
    .replace(/\{agencia\}/gi, nombreAgencia)
    .replace(/\{destino\}/gi, destino);
}

/**
 * Detecta si la posición actual del cursor corresponde a un disparador de comando «/».
 *
 * Condiciones:
 * 1. Hay un carácter '/' antes de cursorPos.
 * 2. El '/' está al inicio del texto o precedido por un espacio en blanco o salto de línea (no dentro de una URL).
 * 3. No hay espacios en blanco ni saltos de línea entre el '/' y el cursor.
 */
export function detectarDisparadorSlash(
  texto: string,
  cursorPos: number,
): DisparadorSlashDetectado | null {
  if (cursorPos < 1 || cursorPos > texto.length) {
    return null;
  }

  // Obtenemos el texto hasta la posición del cursor
  const textoHastaCursor = texto.slice(0, cursorPos);
  const ultimoSlash = textoHastaCursor.lastIndexOf('/');

  if (ultimoSlash === -1) {
    return null;
  }

  // Verificar que el slash esté al inicio o precedido por espacio o salto de línea
  if (ultimoSlash > 0) {
    const caracterPrevio = textoHastaCursor[ultimoSlash - 1];
    if (caracterPrevio !== ' ' && caracterPrevio !== '\n' && caracterPrevio !== '\t') {
      return null;
    }
  }

  // Extraer el texto del comando entre el slash y el cursor
  const fragmentoComando = textoHastaCursor.slice(ultimoSlash + 1);

  // Si contiene espacios o saltos de línea, el comando ya terminó o no es válido
  if (/\s/.test(fragmentoComando)) {
    return null;
  }

  return {
    activo: true,
    query: fragmentoComando,
    indiceInicio: ultimoSlash,
    longitudComando: fragmentoComando.length + 1, // incluye el '/'
  };
}

/**
 * Reemplaza el comando disparador «/atajo» por el contenido expandido e interpolado.
 */
export function reemplazarComandoSlash(
  texto: string,
  indiceInicio: number,
  longitudComando: number,
  textoInsertar: string,
): { nuevoTexto: string; nuevaPosCursor: number } {
  const antes = texto.slice(0, indiceInicio);
  const despues = texto.slice(indiceInicio + longitudComando);
  const nuevoTexto = `${antes}${textoInsertar}${despues}`;
  const nuevaPosCursor = indiceInicio + textoInsertar.length;

  return { nuevoTexto, nuevaPosCursor };
}

/**
 * Filtra y ordena las respuestas rápidas según una consulta y categoría opcional.
 */
export function filtrarRespuestasRapidas(
  respuestas: RespuestaRapida[],
  query: string = '',
  categoria?: CategoriaRespuestaRapida | 'todas',
): RespuestaRapida[] {
  const consultaLimpia = query.replace(/^\//, '').trim().toLowerCase();

  return respuestas
    .filter((rr) => {
      if (categoria && categoria !== 'todas' && rr.categoria !== categoria) {
        return false;
      }
      if (!consultaLimpia) {
        return true;
      }

      const coincideAtajo = rr.atajo.toLowerCase().includes(consultaLimpia);
      const coincideTitulo = rr.titulo.toLowerCase().includes(consultaLimpia);
      const coincideContenido = rr.contenido.toLowerCase().includes(consultaLimpia);

      return coincideAtajo || coincideTitulo || coincideContenido;
    })
    .sort((a, b) => {
      if (!consultaLimpia) {
        return a.atajo.localeCompare(b.atajo);
      }

      // Priorizar coincidencia exacta de atajo
      const aExacto = a.atajo.toLowerCase() === consultaLimpia;
      const bExacto = b.atajo.toLowerCase() === consultaLimpia;
      if (aExacto && !bExacto) return -1;
      if (!aExacto && bExacto) return 1;

      // Priorizar prefijo en el atajo
      const aPrefijo = a.atajo.toLowerCase().startsWith(consultaLimpia);
      const bPrefijo = b.atajo.toLowerCase().startsWith(consultaLimpia);
      if (aPrefijo && !bPrefijo) return -1;
      if (!aPrefijo && bPrefijo) return 1;

      return a.titulo.localeCompare(b.titulo);
    });
}

/**
 * Validación de datos para crear o editar una respuesta rápida.
 */
export function validarRespuestaRapida(data: Partial<RespuestaRapida>): {
  valido: boolean;
  errores: Record<string, string>;
} {
  const errores: Record<string, string> = {};

  const atajo = (data.atajo || '').trim().toLowerCase();
  if (!atajo) {
    errores.atajo = 'El atajo es obligatorio (ej. "saludo", "cuenta").';
  } else if (!/^[a-z0-9_-]{2,30}$/.test(atajo)) {
    errores.atajo = 'El atajo debe contener entre 2 y 30 caracteres alfanuméricos sin espacios.';
  }

  const titulo = (data.titulo || '').trim();
  if (!titulo) {
    errores.titulo = 'El título descriptivo es obligatorio.';
  } else if (titulo.length < 3 || titulo.length > 80) {
    errores.titulo = 'El título debe tener entre 3 y 80 caracteres.';
  }

  const contenido = (data.contenido || '').trim();
  if (!contenido) {
    errores.contenido = 'El contenido del mensaje es obligatorio.';
  } else if (contenido.length < 5 || contenido.length > 1500) {
    errores.contenido = 'El contenido debe tener entre 5 y 1500 caracteres.';
  }

  const categoriasValidas: CategoriaRespuestaRapida[] = [
    'general',
    'cotizaciones',
    'pagos',
    'operaciones',
  ];
  if (!data.categoria || !categoriasValidas.includes(data.categoria)) {
    errores.categoria = 'La categoría seleccionada no es válida.';
  }

  return {
    valido: Object.keys(errores).length === 0,
    errores,
  };
}

const PREFIJO_STORAGE = 'viajapro:respuestas_rapidas';

/**
 * Obtiene las respuestas rápidas almacenadas para la agencia.
 * Si no existen o el almacenamiento falla, retorna las respuestas por defecto.
 */
export function obtenerRespuestasRapidas(tenantId?: string | null): RespuestaRapida[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return RESPUESTAS_RAPIDAS_POR_DEFECTO;
  }

  try {
    const clave = `${PREFIJO_STORAGE}:${tenantId || 'global'}`;
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) {
      return RESPUESTAS_RAPIDAS_POR_DEFECTO;
    }

    const parseado = JSON.parse(crudo) as unknown;
    if (Array.isArray(parseado) && parseado.length > 0) {
      return parseado as RespuestaRapida[];
    }
    return RESPUESTAS_RAPIDAS_POR_DEFECTO;
  } catch {
    return RESPUESTAS_RAPIDAS_POR_DEFECTO;
  }
}

/**
 * Guarda el catálogo de respuestas rápidas para la agencia en almacenamiento local.
 */
export function guardarRespuestasRapidas(
  respuestas: RespuestaRapida[],
  tenantId?: string | null,
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  try {
    const clave = `${PREFIJO_STORAGE}:${tenantId || 'global'}`;
    window.localStorage.setItem(clave, JSON.stringify(respuestas));
    return true;
  } catch {
    return false;
  }
}

/**
 * Restablece las respuestas rápidas a los valores predeterminados para la agencia.
 */
export function restablecerRespuestasRapidasPorDefecto(
  tenantId?: string | null,
): RespuestaRapida[] {
  guardarRespuestasRapidas(RESPUESTAS_RAPIDAS_POR_DEFECTO, tenantId);
  return RESPUESTAS_RAPIDAS_POR_DEFECTO;
}
