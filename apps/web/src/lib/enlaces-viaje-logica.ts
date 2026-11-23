/**
 * Enlaces entre las tres piezas del viaje: conversación, cotización y archivo de viaje (file).
 *
 * Cada una guarda el id de las otras solo en parte: la cotización y el file traen `contactoId`; el
 * file trae además `cotizacionId`; la conversación trae `contactoId`. Nadie trae `conversacionId`.
 * Así que la conversación se resuelve por el contacto y el file de una cotización, por su
 * `cotizacionId`, con lo que la web ya pide (una búsqueda en la bandeja y la lista de archivos),
 * sin una petición por fila. Cuando el contrato traiga el id de la conversación (T-283) esto se
 * reemplaza por leerlo directamente.
 */
import type { ConversacionResumen, ResumenDeArchivo } from '@viajapro/contracts';

export const hrefConversacion = (conversacionId: string): string => `/bandeja/${conversacionId}`;
export const hrefContacto = (contactoId: string): string => `/contactos/${contactoId}`;
export const hrefCotizacion = (cotizacionId: string): string => `/cotizaciones/${cotizacionId}`;
export const hrefArchivo = (archivoId: string): string => `/viajes?id=${archivoId}`;
/** El cobro vive en el panel del archivo de viaje; el ancla lo lleva hasta él (`#cobro`). */
export const hrefCobro = (archivoId: string): string => `/viajes?id=${archivoId}#cobro`;

type ConversacionParaEnlace = Pick<ConversacionResumen, 'id' | 'contactoId' | 'ultimoMensajeEn'>;

/** La conversación más reciente del contacto, o `null` si la búsqueda no trae ninguna suya. */
export function conversacionDelContacto(
  conversaciones: readonly ConversacionParaEnlace[],
  contactoId: string,
): string | null {
  let mejor: ConversacionParaEnlace | null = null;
  for (const c of conversaciones) {
    if (c.contactoId !== contactoId) continue;
    if (!mejor || (c.ultimoMensajeEn ?? '') > (mejor.ultimoMensajeEn ?? '')) mejor = c;
  }
  return mejor?.id ?? null;
}

/** El término con el que la bandeja encuentra al contacto: su teléfono (único) o, si no, su nombre. */
export function terminoDeBusquedaDelContacto(contacto: {
  telefono?: string | null | undefined;
  nombre?: string | null | undefined;
}): string | null {
  const telefono = contacto.telefono?.trim();
  if (telefono) return telefono;
  const nombre = contacto.nombre?.trim();
  return nombre ? nombre : null;
}

type ArchivoParaEnlace = Pick<
  ResumenDeArchivo,
  'id' | 'numero' | 'cotizacionId' | 'contactoId' | 'estado' | 'fechaSalida'
>;

/** El file que nació de esta cotización, esté abierto o cancelado. */
export function archivoDeLaCotizacion<T extends ArchivoParaEnlace>(
  archivos: readonly T[],
  cotizacionId: string,
): T | null {
  return archivos.find((a) => a.cotizacionId === cotizacionId) ?? null;
}

/** El file vigente del contacto: el abierto de salida más próxima. Cancelados no cuentan. */
export function archivoVigenteDelContacto<T extends ArchivoParaEnlace>(
  archivos: readonly T[],
  contactoId: string,
): T | null {
  let mejor: T | null = null;
  for (const a of archivos) {
    if (a.contactoId !== contactoId || a.estado !== 'ABIERTO') continue;
    if (!mejor || a.fechaSalida < mejor.fechaSalida) mejor = a;
  }
  return mejor;
}

/** La cotización vigente del contacto: la última que se le envió; si ninguna se envió, la primera de la lista. */
export function cotizacionVigenteDelContacto<
  T extends { enviadaEn: string | null; version: number },
>(cotizaciones: readonly T[]): T | null {
  let mejor: T | null = null;
  for (const c of cotizaciones) {
    if (!mejor || (c.enviadaEn ?? '') > (mejor.enviadaEn ?? '')) mejor = c;
  }
  return mejor;
}

/** Texto del enlace al file: «File 1043». */
export const etiquetaDelArchivo = (numero: number): string => `File ${numero}`;

export interface EnlaceDelViaje {
  clave: 'conversacion' | 'contacto' | 'cotizacion' | 'archivo' | 'cobro';
  /** Texto del enlace: lo que abre, no «ver más». */
  texto: string;
  /** `null` = la pieza no existe todavía o no es visible: se explica en `sinDestino`. */
  href: string | null;
  /** Qué decir cuando no hay a dónde ir («Sin file todavía»). */
  sinDestino?: string;
  cargando?: boolean;
}

type EstadoParaEnlace<T> = { tipo: 'cargando' } | { tipo: 'listo'; valor: T };

export function enlaceDeConversacion(estado: EstadoParaEnlace<string | null>): EnlaceDelViaje {
  if (estado.tipo === 'cargando') {
    return { clave: 'conversacion', texto: 'Conversación', href: null, cargando: true };
  }
  return {
    clave: 'conversacion',
    texto: 'Abrir conversación',
    href: estado.valor ? hrefConversacion(estado.valor) : null,
    sinDestino: 'Sin conversación en la bandeja',
  };
}

export function enlaceDeContacto(contactoId: string, nombre?: string | null): EnlaceDelViaje {
  return {
    clave: 'contacto',
    texto: nombre ? `Contacto: ${nombre}` : 'Ver contacto',
    href: hrefContacto(contactoId),
  };
}

export function enlaceDeCotizacion(cotizacionId: string, version?: number): EnlaceDelViaje {
  return {
    clave: 'cotizacion',
    texto: version ? `Cotización v${version}` : 'Ver cotización',
    href: hrefCotizacion(cotizacionId),
  };
}

export function enlaceDeArchivo(
  estado: EstadoParaEnlace<{ id: string; numero: number | null } | null>,
): EnlaceDelViaje {
  if (estado.tipo === 'cargando') {
    return { clave: 'archivo', texto: 'File', href: null, cargando: true };
  }
  return {
    clave: 'archivo',
    texto: estado.valor
      ? estado.valor.numero === null
        ? 'Ver file'
        : etiquetaDelArchivo(estado.valor.numero)
      : 'Sin file',
    href: estado.valor ? hrefArchivo(estado.valor.id) : null,
    sinDestino: 'Sin archivo de viaje todavía',
  };
}

/**
 * El cobro del viaje: lo que pagó y lo que debe. No existe sin archivo de viaje y se oculta a quien
 * no tiene `cobro.ver` (solo oculta; la API decide). Devuelve `null` cuando no hay nada que enlazar,
 * para no sumar un segundo «sin archivo» a la fila.
 */
export function enlaceDeCobro(
  archivo: { id: string } | null,
  puedeVerCobros: boolean,
): EnlaceDelViaje | null {
  if (!archivo || !puedeVerCobros) return null;
  return { clave: 'cobro', texto: 'Cobro del viaje', href: hrefCobro(archivo.id) };
}

/** Quita los huecos (`null`) de una lista de enlaces. */
export function soloEnlaces(enlaces: ReadonlyArray<EnlaceDelViaje | null>): EnlaceDelViaje[] {
  return enlaces.filter((e): e is EnlaceDelViaje => e !== null);
}
