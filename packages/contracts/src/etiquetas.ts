/**
 * Etiquetas de conversación de la agencia (`Label`, T-325, HU-inbox-1).
 *
 * Catálogo POR AGENCIA (R12: tabla, nunca `enum`) con color de una paleta fija del sistema de
 * diseño (invariante de accesibilidad, sin rojo). Ayuda visual del chat: ninguna etiqueta calcula
 * un saldo ni un estado de cobro.
 *
 * **El nombre es texto libre de la agencia y puede llevar el nombre de una persona (R10):** ni
 * los logs, ni los eventos de dominio, ni el outbox llevan el nombre; solo el id. Por eso ningún
 * mensaje de error de aquí lo incluye.
 */

import { z } from 'zod';
import { Id } from './comunes.js';

/** Las claves de la paleta. El CHECK `etiquetas_color_de_la_paleta` de la base es el reflejo. */
export const COLORES_DE_ETIQUETA = [
  'gris',
  'azul',
  'turquesa',
  'verde',
  'ambar',
  'naranja',
  'rosa',
  'dorado',
] as const;
export const ColorDeEtiqueta = z.enum(COLORES_DE_ETIQUETA);
export type ColorDeEtiqueta = z.infer<typeof ColorDeEtiqueta>;

/** Topes (supuestos de HU-inbox-1 §3): los impone la API, no la base. */
export const MAX_ETIQUETAS_POR_AGENCIA = 50;
export const MAX_ETIQUETAS_POR_CONVERSACION = 10;
/** Cuántas etiquetas admite el filtro de la bandeja a la vez: las de una conversación. */
export const MAX_ETIQUETAS_EN_EL_FILTRO = MAX_ETIQUETAS_POR_CONVERSACION;

export const LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA = 30;
/** `orden` es SMALLINT en la base. */
export const ORDEN_MAXIMO_DE_ETIQUETA = 32767;

// -----------------------------------------------------------------------------------------
// Normalización del nombre (T-399)
// -----------------------------------------------------------------------------------------

/**
 * Invisibles y de formato que se RECHAZAN (no se limpian: quien los pega no sabe que están):
 * U+200B-200F (ancho cero, ZWNJ, ZWJ, marcas de dirección), U+2060 (unidor de palabras), U+061C,
 * U+FEFF (BOM / ancho cero), U+202A-202E y U+2066-2069 (control bidireccional: invierten lo que
 * se ve). Se comprueba ANTES de convertir espacios, porque U+FEFF cuenta como espacio para `\s`.
 */
// Con `new RegExp` y la secuencia escrita (`\\u200B`): en un literal, un formateador puede sustituir la
// secuencia por el carácter invisible y el archivo dejaría de decir qué rechaza.
const INVISIBLES_PROHIBIDOS = new RegExp(
  '[\\u200B-\\u200F\\u2060\\u061C\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
  'u',
);
/** Controles C0 (los de espacio ya pasaron a U+0020), DEL y C1 (incluye U+0085). */
// eslint-disable-next-line no-control-regex -- justamente se rechazan caracteres de control
const CONTROLES = /[\u0000-\u001F\u007F-\u009F]/u;

export type ResultadoDeNormalizar =
  { ok: true; nombre: string } | { ok: false; motivo: 'PROHIBIDO' | 'VACIO' | 'LARGO' };

/**
 * NFC; rechaza invisibles y controles; todo espacio Unicode (`\s`: tabulación, salto de línea,
 * NBSP, U+2000-200A, U+2028/2029, U+3000…) pasa a U+0020 ANTES de recortar; los espacios seguidos
 * se reducen a uno y se recortan los extremos; 1 a 30 caracteres (puntos de código, como
 * `char_length` de Postgres). El resultado es lo que cumple el CHECK `etiquetas_nombre_forma`.
 */
export function normalizarNombreDeEtiqueta(entrada: string): ResultadoDeNormalizar {
  const nfc = entrada.normalize('NFC');
  if (INVISIBLES_PROHIBIDOS.test(nfc)) return { ok: false, motivo: 'PROHIBIDO' };
  const nombre = nfc.replace(/\s/gu, ' ').replace(/ {2,}/gu, ' ').trim();
  if (CONTROLES.test(nombre)) return { ok: false, motivo: 'PROHIBIDO' };
  const largo = [...nombre].length;
  if (largo === 0) return { ok: false, motivo: 'VACIO' };
  if (largo > LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA) return { ok: false, motivo: 'LARGO' };
  return { ok: true, nombre };
}

const MENSAJES_DE_NOMBRE = {
  PROHIBIDO: 'El nombre tiene caracteres que no se admiten (invisibles o de control).',
  VACIO: 'El nombre no puede estar vacío.',
  LARGO: `El nombre admite hasta ${LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA} caracteres.`,
} as const;

/**
 * El nombre tal como entra por la API: se acota ANTES de normalizar (no se procesa un cuerpo
 * gigante) y sale ya normalizado. El mensaje de error nunca repite el nombre.
 */
export const NombreDeEtiqueta = z
  .string()
  .max(200, MENSAJES_DE_NOMBRE.LARGO)
  .transform((entrada, ctx) => {
    const r = normalizarNombreDeEtiqueta(entrada);
    if (!r.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJES_DE_NOMBRE[r.motivo] });
      return z.NEVER;
    }
    return r.nombre;
  });

// -----------------------------------------------------------------------------------------
// Catálogo
// -----------------------------------------------------------------------------------------

export const Etiqueta = z.object({
  id: Id,
  nombre: z.string().min(1).max(LONGITUD_MAXIMA_DEL_NOMBRE_DE_ETIQUETA),
  color: ColorDeEtiqueta,
  orden: z.number().int().min(0).max(ORDEN_MAXIMO_DE_ETIQUETA),
});
export type Etiqueta = z.infer<typeof Etiqueta>;

/** Lo que lleva cada fila y el encabezado de una conversación: sin `orden` (ya viene ordenada). */
export const EtiquetaDeConversacion = Etiqueta.pick({ id: true, nombre: true, color: true });
export type EtiquetaDeConversacion = z.infer<typeof EtiquetaDeConversacion>;

export const ListaDeEtiquetas = z.object({ datos: z.array(Etiqueta) });
export type ListaDeEtiquetas = z.infer<typeof ListaDeEtiquetas>;

export const CrearEtiquetaCuerpo = z.object({
  nombre: NombreDeEtiqueta,
  color: ColorDeEtiqueta,
});
export type CrearEtiquetaCuerpo = z.infer<typeof CrearEtiquetaCuerpo>;

/** Renombrar, recolorear y ordenar: cualquiera de las tres, al menos una. */
export const ActualizarEtiquetaCuerpo = z
  .object({
    nombre: NombreDeEtiqueta.optional(),
    color: ColorDeEtiqueta.optional(),
    orden: z.number().int().min(0).max(ORDEN_MAXIMO_DE_ETIQUETA).optional(),
  })
  .refine((c) => c.nombre !== undefined || c.color !== undefined || c.orden !== undefined, {
    message: 'Indica al menos un cambio: nombre, color u orden.',
  });
export type ActualizarEtiquetaCuerpo = z.infer<typeof ActualizarEtiquetaCuerpo>;

// -----------------------------------------------------------------------------------------
// Filtro de la bandeja
// -----------------------------------------------------------------------------------------

/** Cualquiera de las etiquetas (o) o todas (y). Por defecto, cualquiera (HU-inbox-1 §4.3). */
export const ModoDeFiltroDeEtiquetas = z.enum(['cualquiera', 'todas']);
export type ModoDeFiltroDeEtiquetas = z.infer<typeof ModoDeFiltroDeEtiquetas>;

/**
 * `?etiquetas=<uuid>,<uuid>` o repetido (`?etiquetas=a&etiquetas=b`). Cada una es un UUID: una
 * cadena cualquiera no llega a la consulta. Sin duplicados, hasta `MAX_ETIQUETAS_EN_EL_FILTRO`.
 */
export const IdsDeEtiquetasEnElFiltro = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v.split(',')
      : Array.isArray(v)
        ? (v as unknown[]).flatMap((x) => (typeof x === 'string' ? x.split(',') : [x]))
        : v,
  z
    .array(Id)
    .min(1)
    .max(MAX_ETIQUETAS_EN_EL_FILTRO)
    .transform((ids) => [...new Set(ids)]),
);
