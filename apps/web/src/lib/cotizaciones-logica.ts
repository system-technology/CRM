import { formatearErrorAmigable } from './estados-ui-logica';
import { formatearDinero, formatearFecha } from './formato';
/**
 * Lógica pura para el guardado y versionado de cotizaciones comerciales (0c.22 y T-107).
 *
 * Conforme a @viajapro/contracts (GuardarCotizacion, AnadirVersionACotizacion, ComposicionDeVersion, CotizacionGuardada, VersionDeCotizacion).
 * Invariante R3: Esquemas Zod estrictos. Quien guarda manda COMPOSICIÓN Y SALIDA,
 * NUNCA importes monetarios (el servidor recalcula en base de datos bajo transacción).
 */

import {
  type Acomodacion,
  type AnadirVersionACotizacion,
  type CotizacionGuardada,
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
  opcionDeSalidaId?: string | undefined;
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
  if (entrada.opcionDeSalidaId) {
    composicionLimpia['opcionDeSalidaId'] = entrada.opcionDeSalidaId;
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
          'Falta identificar la agencia activa. Verifique su sesión o configuración de desarrollo.',
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

  const msg = formatearErrorAmigable(error, 'Error al procesar la cotización.');
  return {
    codigo: 'DESCONOCIDO',
    mensaje: msg,
    esErrorAgencia: false,
  };
}

/**
 * Genera el texto completo de propuesta comercial para WhatsApp a partir de una versión cotizada.
 * Estricto R10: Cero filtración de neto o margen al cliente.
 */
export function generarMensajeWhatsAppCotizacion(
  cotizacion: { titulo: string },
  version: VersionDeCotizacion,
  opciones?: { contactoNombre?: string | undefined },
): string {
  const nombreViajero = opciones?.contactoNombre?.trim() || 'Viajero';
  const linesText = version.lineas
    .map((l) => `  • ${l.nombre} (${l.veces}x) — *${formatearDinero(l.total)}*`)
    .join('\n');

  let msg =
    `¡Hola, ${nombreViajero}! Te comparto la ${cotizacion.titulo} (Versión ${version.numero}):\n\n` +
    `🌴 *${version.paqueteNombre.toUpperCase()}*\n` +
    `📍 *Destino:* ${version.destino}\n` +
    `📅 *Fecha de Salida:* ${formatearFecha(version.fechaSalida)} (${version.noches} noches)\n` +
    `👥 *Pasajeros:* ${version.adultos} adulto(s)${version.ninos > 0 ? `, ${version.ninos} niño(s)` : ''}${version.infantes > 0 ? `, ${version.infantes} infante(s)` : ''}\n\n` +
    `📋 *Desglose de Tarifas:*\n` +
    `${linesText}\n\n` +
    `💰 *TOTAL VENTA:* *${formatearDinero(version.venta)}*`;

  if (version.vigenteHasta) {
    msg += `\n⏳ *Oferta vigente hasta:* ${formatearFecha(version.vigenteHasta)}`;
  }

  msg += `\n\n_Quedo muy atento a cualquier consulta para confirmar tu reserva._`;
  return msg;
}

/**
 * Genera enlace universal de WhatsApp (wa.me) con número limpio y texto URL-encoded.
 */
export function generarEnlaceWhatsApp(telefonoE164: string, mensaje: string): string {
  const digitos = telefonoE164.replace(/\D/g, '');
  const mensajeCodificado = encodeURIComponent(mensaje);
  return `https://wa.me/${digitos}?text=${mensajeCodificado}`;
}

/**
 * Extrae la composición exacta de una versión existente para duplicarla como versión N+1.
 */
export function duplicarVersionComoComposicion(
  version: VersionDeCotizacion,
): AnadirVersionACotizacion {
  return armarComposicionDeVersion({
    paqueteId: version.paqueteId,
    fecha: version.fechaSalida,
    adultos: version.adultos,
    ninos: version.ninos,
    infantes: version.infantes,
    acomodacion: (version.acomodacion as Acomodacion) || undefined,
    opcionDeSalidaId: version.opcionDeSalidaId || undefined,
    vigenteHasta: version.vigenteHasta || undefined,
  });
}

/**
 * Extrae los datos para clonar una cotización completa como una nueva cotización en borrador.
 */
export function duplicarCotizacionComoEntrada(
  cotizacion: CotizacionGuardada,
  version?: VersionDeCotizacion,
  tituloNuevo?: string,
): GuardarCotizacion {
  const v = version ?? cotizacion.versiones[cotizacion.versiones.length - 1]!;
  return armarCuerpoGuardarCotizacion({
    contactoId: cotizacion.contactoId,
    oportunidadId: cotizacion.oportunidadId || undefined,
    titulo: tituloNuevo?.trim() || `${cotizacion.titulo} (Copia)`,
    composicion: {
      paqueteId: v.paqueteId,
      fecha: v.fechaSalida,
      adultos: v.adultos,
      ninos: v.ninos,
      infantes: v.infantes,
      acomodacion: (v.acomodacion as Acomodacion) || undefined,
      opcionDeSalidaId: v.opcionDeSalidaId || undefined,
      vigenteHasta: v.vigenteHasta || undefined,
    },
  });
}

export interface DesgloseMargenSeguro {
  visible: boolean;
  netoTotalCOP?: number | undefined;
  ventaTotalCOP?: number | undefined;
  margenBrutoCOP?: number | undefined;
  margenPorcentaje?: number | undefined;
  baseCalculo?: string | undefined;
  politicaPorcentaje?: number | undefined;
}

/**
 * Calcula el desglose de margen para uso exclusivo de asesores autorizados (ADR-0011).
 * Si puedeVerNeto es falso, garantiza CERO filtración de datos sensibles.
 */
export function calcularDesgloseMargen(
  version: VersionDeCotizacion,
  puedeVerNeto: boolean,
): DesgloseMargenSeguro {
  if (!puedeVerNeto) {
    return { visible: false };
  }

  const venta = parseInt(version.venta.unidades, 10);
  const neto = version.neto ? parseInt(version.neto.unidades, 10) : undefined;
  const margen = version.margen
    ? parseInt(version.margen.unidades, 10)
    : neto !== undefined
      ? Math.max(0, venta - neto)
      : version.politica
        ? Math.round((venta * version.politica.porcentaje) / (100 + version.politica.porcentaje))
        : undefined;

  const netoFinal = neto ?? (margen !== undefined ? Math.max(0, venta - margen) : undefined);
  const porcentaje =
    margen !== undefined && venta > 0
      ? +((margen / venta) * 100).toFixed(1)
      : version.politica?.porcentaje;

  return {
    visible: true,
    netoTotalCOP: netoFinal,
    ventaTotalCOP: venta,
    margenBrutoCOP: margen,
    margenPorcentaje: porcentaje,
    baseCalculo: version.politica?.base,
    politicaPorcentaje: version.politica?.porcentaje,
  };
}
