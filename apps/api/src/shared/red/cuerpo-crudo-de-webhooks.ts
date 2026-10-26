/**
 * El cuerpo crudo de `/webhooks`, con su tope.
 *
 * Vive aquí y no en `main.ts` para que lo monten `main.ts` Y las pruebas: antes cada prueba
 * copiaba la línea, así que un cambio de límite en `main.ts` no ponía nada en rojo.
 *
 * Los webhooks de Meta se firman sobre el CUERPO CRUDO, y el tope impide que un POST sin firma
 * verificada —la firma se comprueba después de leer el cuerpo— llene la memoria.
 */
import type { RequestHandler } from 'express';
import express from 'express';

export const LIMITE_DE_CUERPO_DE_WEBHOOK = '1mb';

export function cuerpoCrudoDeWebhooks(): RequestHandler {
  return express.raw({ type: '*/*', limit: LIMITE_DE_CUERPO_DE_WEBHOOK });
}
