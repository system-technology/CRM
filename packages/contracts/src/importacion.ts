/**
 * Importación de catálogo desde un archivo (ADR-0017 §4.2).
 *
 * El navegador lee el CSV o el `.xlsx` y manda una tabla de texto más el mapeo de columnas; el
 * servidor la convierte en una `PropuestaDeCatalogo` y la pasa por el mismo núcleo que los demás
 * canales. El servidor no recibe archivos: valida cada celda como si viniera de un desconocido.
 *
 * Sin `tenantId` en ningún objeto (todos `.strict()`): el tenant sale de la sesión.
 */

import { z } from 'zod';
import { InformeDeCatalogo, PropuestaDeCatalogo } from './propuesta-de-catalogo.js';

/** Topes de la tabla (ADR-0017 §4.2). Superarlos es 413, sin validar fila alguna. */
export const MAXIMO_DE_FILAS_DE_IMPORTACION = 2000;
export const MAXIMO_DE_COLUMNAS_DE_IMPORTACION = 40;
export const MAXIMO_DE_CUERPO_DE_IMPORTACION_EN_BYTES = 2 * 1024 * 1024;

const Celda = z.string().max(2000);

export const TablaDeImportacion = z
  .object({
    encabezados: z.array(Celda).min(1).max(MAXIMO_DE_COLUMNAS_DE_IMPORTACION),
    filas: z
      .array(z.array(Celda).max(MAXIMO_DE_COLUMNAS_DE_IMPORTACION))
      .max(MAXIMO_DE_FILAS_DE_IMPORTACION),
    /** Número que tiene en la hoja la primera fila de datos (la 1 es el encabezado). */
    filaInicial: z.number().int().min(2).max(100000).default(2),
  })
  .strict();
export type TablaDeImportacion = z.infer<typeof TablaDeImportacion>;

export const FormatoDeFechaDeImportacion = z.enum(['DD/MM/AAAA', 'MM/DD/AAAA']);
export type FormatoDeFechaDeImportacion = z.infer<typeof FormatoDeFechaDeImportacion>;

/**
 * Qué columna de la tabla es cada clave de la plantilla (`PLANTILLAS_DE_SISTEMA`). El valor es el
 * índice del encabezado. Las fechas `AAAA-MM-DD` se aceptan siempre; `formatoDeFecha` solo decide
 * cómo se leen las que traen barras.
 */
export const MapeoDeColumnas = z
  .object({
    /** Clave del formato de sistema: `excursion-un-dia`, `pasadia`, … */
    formato: z.string().regex(/^[a-z][a-z0-9-]*$/),
    columnas: z.record(
      z.string().regex(/^[a-z][a-z0-9_]*$/),
      z
        .number()
        .int()
        .min(0)
        .max(MAXIMO_DE_COLUMNAS_DE_IMPORTACION - 1),
    ),
    /** Moneda cuando la hoja no trae columna de moneda. */
    moneda: z.enum(['COP', 'USD', 'EUR', 'MXN']).optional(),
    formatoDeFecha: FormatoDeFechaDeImportacion.default('DD/MM/AAAA'),
  })
  .strict();
export type MapeoDeColumnas = z.infer<typeof MapeoDeColumnas>;

export const EntradaDeImportacion = z.union([
  z.object({ tabla: TablaDeImportacion, mapeo: MapeoDeColumnas }).strict(),
  z.object({ propuesta: PropuestaDeCatalogo }).strict(),
]);
export type EntradaDeImportacion = z.infer<typeof EntradaDeImportacion>;

export const RespuestaDePrevisualizacion = z
  .object({ informe: InformeDeCatalogo, huella: z.string() })
  .strict();
export type RespuestaDePrevisualizacion = z.infer<typeof RespuestaDePrevisualizacion>;

// =============================================================================
// Sugerencia de mapeo
// =============================================================================

export const PeticionDeSugerenciaDeMapeo = z
  .object({
    encabezados: z.array(Celda).min(1).max(MAXIMO_DE_COLUMNAS_DE_IMPORTACION),
    /** Primera línea del CSV: `#viajapro;plantilla=<formato>;version=<n>`. */
    marcador: z.string().max(200).optional(),
    /** Formato elegido por la persona cuando no hay marcador. */
    formato: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
  })
  .strict();
export type PeticionDeSugerenciaDeMapeo = z.infer<typeof PeticionDeSugerenciaDeMapeo>;

export const SugerenciaDeMapeo = z
  .object({
    formato: z.string(),
    version: z.number().int().min(1),
    columnas: z.record(z.string(), z.object({ indice: z.number().int(), confianza: z.number() })),
    /** Índices de encabezados que no se pudieron asignar a ninguna clave. */
    sinMapear: z.array(z.number().int()),
  })
  .strict();
export type SugerenciaDeMapeo = z.infer<typeof SugerenciaDeMapeo>;

// =============================================================================
// Confirmación (todo o nada)
// =============================================================================

const HuellaDeImportacion = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * La misma entrada que previsualizar, más la `huella` que devolvió. Con tabla puede traer el mapeo
 * que sugirió el servidor, solo para dejarlo en la auditoría junto al confirmado.
 */
export const ConfirmarImportacion = z.union([
  z
    .object({
      tabla: TablaDeImportacion,
      mapeo: MapeoDeColumnas,
      mapeoSugerido: SugerenciaDeMapeo.optional(),
      huella: HuellaDeImportacion,
    })
    .strict(),
  z.object({ propuesta: PropuestaDeCatalogo, huella: HuellaDeImportacion }).strict(),
]);
export type ConfirmarImportacion = z.infer<typeof ConfirmarImportacion>;

export const RespuestaDeConfirmacion = z
  .object({
    informe: InformeDeCatalogo,
    paquetes: z.array(
      z.object({
        indice: z.number().int(),
        id: z.string(),
        accion: z.enum(['CREAR', 'ACTUALIZAR', 'SIN_CAMBIOS']),
      }),
    ),
  })
  .strict();
export type RespuestaDeConfirmacion = z.infer<typeof RespuestaDeConfirmacion>;
