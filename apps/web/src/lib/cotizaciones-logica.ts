/**
 * Lógica pura para el guardado y versionado de cotizaciones comerciales (0c.22).
 *
 * Conforme a @viajapro/contracts (GuardarCotizacion, AnadirVersionACotizacion, ComposicionDeVersion, CotizacionGuardada, VersionDeCotizacion).
 * Invariante R3: Esquemas Zod estrictos. Quien guarda manda COMPOSICIÓN Y SALIDA,
 * NUNCA importes monetarios (el servidor recalcula en base de datos bajo transacción).
 */

import {
  type Acomodacion,
  type AnadirVersionACotizacion,
  type GuardarCotizacion,
  type VersionDeCotizacion,
  AnadirVersionACotizacion as EsquemaAnadirVersionACotizacion,
  ComposicionDeVersion as EsquemaComposicionDeVersion,
  GuardarCotizacion as EsquemaGuardarCotizacion,
} from '@viajapro/contracts';

export interface EntradaComposicionVersion {
  paqueteId: string;
  fecha: string;
  adultos?: number | undefined;
  ninos?: number | undefined;
  infantes?: number | undefined;
  acomodacion?: Acomodacion | undefined;
  vigenteHasta?: string | undefined;
  [key: string]: unknown;
}

export interface EntradaGuardarCotizacion {
  contactoId: string;
  oportunidadId?: string | undefined;
  titulo: string;
  composicion: EntradaComposicionVersion;
}

/**
 * Arma la composición de una versión asegurando estricta exclusión de importes.
 * El esquema Zod ComposicionDeVersion es .strict() y fallará si se filtran importes.
 */
export function armarComposicionDeVersion(
  entrada: EntradaComposicionVersion,
): GuardarCotizacion['version'] {
  const composicionLimpia: Record<string, unknown> = {
    paqueteId: entrada.paqueteId,
    fecha: entrada.fecha,
  };

  if (typeof entrada.adultos === 'number' && entrada.adultos > 0) {
    composicionLimpia['adultos'] = entrada.adultos;
  }
  if (typeof entrada.ninos === 'number' && entrada.ninos >= 0) {
    composicionLimpia['ninos'] = entrada.ninos;
  }
  if (typeof entrada.infantes === 'number' && entrada.infantes >= 0) {
    composicionLimpia['infantes'] = entrada.infantes;
  }
  if (entrada.acomodacion) {
    composicionLimpia['acomodacion'] = entrada.acomodacion;
  }
  if (entrada.vigenteHasta) {
    composicionLimpia['vigenteHasta'] = entrada.vigenteHasta;
  }

  return EsquemaComposicionDeVersion.parse(composicionLimpia);
}

/**
 * Construye el cuerpo estricto para crear una nueva cotización con versión 1.
 * POST /api/v1/cotizaciones
 */
export function armarCuerpoGuardarCotizacion(entrada: EntradaGuardarCotizacion): GuardarCotizacion {
  const cuerpo: Record<string, unknown> = {
    contactoId: entrada.contactoId.trim(),
    titulo: entrada.titulo.trim(),
    version: armarComposicionDeVersion(entrada.composicion),
  };

  if (entrada.oportunidadId && entrada.oportunidadId.trim()) {
    cuerpo['oportunidadId'] = entrada.oportunidadId.trim();
  }

  return EsquemaGuardarCotizacion.parse(cuerpo);
}

/**
 * Construye el cuerpo estricto para añadir una versión siguiente a una cotización existente.
 * POST /api/v1/cotizaciones/:id/versiones
 */
export function armarCuerpoAnadirVersion(
  entrada: EntradaComposicionVersion,
): AnadirVersionACotizacion {
  const version = armarComposicionDeVersion(entrada);
  return EsquemaAnadirVersionACotizacion.parse(version);
}

/**
 * Ordena las versiones de una cotización por su número de versión.
 * 'asc': versión 1 primero (histórico cronológico).
 * 'desc': versión más reciente primero (última oferta al cliente).
 */
export function ordenarVersiones(
  versiones: readonly VersionDeCotizacion[],
  orden: 'asc' | 'desc' = 'asc',
): VersionDeCotizacion[] {
  return [...versiones].sort((a, b) =>
    orden === 'asc' ? a.numero - b.numero : b.numero - a.numero,
  );
}

/**
 * Obtiene la versión más reciente (número más alto) de una lista de versiones.
 */
export function obtenerUltimaVersion(
  versiones: readonly VersionDeCotizacion[],
): VersionDeCotizacion | undefined {
  if (versiones.length === 0) return undefined;
  return ordenarVersiones(versiones, 'desc')[0];
}

/**
 * Genera un título sugerido predeterminado para una cotización si el asesor no escribe uno.
 */
export function sugerirTituloCotizacion(paqueteNombre: string, fechaSalida: string): string {
  const nombreLimpio = paqueteNombre.split('—')[0]?.trim() || paqueteNombre.trim();
  return `Cotización ${nombreLimpio} (${fechaSalida})`;
}

/**
 * Traduce códigos de error HTTP / API de cotizaciones a mensajes honestos para el usuario.
 */
export function interpretarErrorCotizaciones(error: unknown): {
  codigo: string;
  mensaje: string;
  esErrorAgencia: boolean;
  detalle?: string;
} {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);

    if (code === 'COTIZACION_NO_ENCONTRADA') {
      return {
        codigo: 'COTIZACION_NO_ENCONTRADA',
        mensaje: 'La cotización solicitada no existe o no está disponible en la agencia.',
        esErrorAgencia: false,
      };
    }

    if (code === 'CONTACTO_NO_ENCONTRADO') {
      return {
        codigo: 'CONTACTO_NO_ENCONTRADO',
        mensaje: 'El contacto seleccionado no existe en el sistema o fue eliminado.',
        esErrorAgencia: false,
      };
    }

    if (code === 'OPORTUNIDAD_NO_ENCONTRADA') {
      return {
        codigo: 'OPORTUNIDAD_NO_ENCONTRADA',
        mensaje: 'La oportunidad comercial indicada no pertenece al contacto seleccionado.',
        esErrorAgencia: false,
      };
    }

    if (code === 'SIN_SESION' || code === 'CONFIG_TENANT_FALTANTE') {
      return {
        codigo: 'SIN_SESION',
        mensaje:
          'Falta identificar la agencia (x-dev-tenant-id). Verifique su configuración de desarrollo.',
        esErrorAgencia: true,
      };
    }

    if (code === 'SIN_VIGENCIA') {
      return {
        codigo: 'SIN_VIGENCIA',
        mensaje: 'No hay precio ni salida disponible para la fecha seleccionada.',
        esErrorAgencia: false,
      };
    }

    if (code === 'VIGENCIAS_EMPATADAS') {
      return {
        codigo: 'VIGENCIAS_EMPATADAS',
        mensaje:
          'El tarifario tiene vigencias solapadas para esta fecha (error de datos de la agencia).',
        esErrorAgencia: true,
      };
    }
  }

  const msg = error instanceof Error ? error.message : 'Error al procesar la cotización.';
  return {
    codigo: 'DESCONOCIDO',
    mensaje: msg,
    esErrorAgencia: false,
  };
}
