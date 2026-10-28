/**
 * El cuerpo JSON de `/api/v1/catalogo/importaciones`, con su tope de 2 MB (ADR-0017 §1 y §4.2).
 *
 * El analizador por defecto de Nest corta en 100 kb, poco para una tabla de 2.000 filas; subirlo
 * globalmente agrandaría la superficie de todas las demás rutas. Este se monta solo en la ruta de
 * importaciones y antes del analizador por defecto, que se salta lo que ya está leído. Pasar de
 * 2 MB es 413 (lo traduce el filtro global) y no se valida nada.
 *
 * Vive aquí y no en `main.ts` para que lo monten `main.ts` y las pruebas.
 */
import type { RequestHandler } from 'express';
import express from 'express';
import { MAXIMO_DE_CUERPO_DE_IMPORTACION_EN_BYTES } from '@viajapro/contracts';

export const RUTA_DE_IMPORTACIONES = '/api/v1/catalogo/importaciones';

export function cuerpoDeImportaciones(): RequestHandler {
  return express.json({ limit: MAXIMO_DE_CUERPO_DE_IMPORTACION_EN_BYTES });
}
