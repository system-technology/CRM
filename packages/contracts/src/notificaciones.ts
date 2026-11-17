/**
 * Las notificaciones en la aplicación (contexto `notifications`, T-254, ADR-0024 §3.6).
 *
 *   GET  /api/v1/notificaciones                 las del usuario de la sesión, no leídas primero
 *   POST /api/v1/notificaciones/:id/lectura     la marca leída (idempotente)
 *
 * **Solo las propias.** Cada notificación tiene UN destinatario, el usuario de la sesión: ni el
 * `tenantId` ni el usuario viajan en la petición. La de otra persona, de la misma agencia o de otra,
 * responde 404 («no existe»), nunca 403.
 *
 * **Sin texto libre.** La notificación trae el tipo, el número de file y el plazo; el texto («El
 * time limit del file 1043 vence en 3 h») lo compone la pantalla, en la zona horaria de la agencia
 * (R9: los instantes viajan en UTC). `archivoId` es a donde lleva el aviso (pantalla Reservas).
 */
import { z } from 'zod';
import { Id, Instante } from './comunes.js';

/** Los avisos de plazo de una reserva (los cuatro eventos `booking.*` de `eventos.ts`). */
export const TipoDeNotificacion = z.enum([
  'TIME_LIMIT_PROXIMO',
  'TIME_LIMIT_VENCIDO',
  'PAGO_TOTAL_PROXIMO',
  'PAGO_TOTAL_VENCIDO',
]);
export type TipoDeNotificacion = z.infer<typeof TipoDeNotificacion>;

export const Notificacion = z.object({
  id: Id,
  tipo: TipoDeNotificacion,
  archivoId: Id,
  reservaId: Id,
  /** El número legible del file («file 1043»). */
  archivoNumero: z.number().int().min(1),
  /** El plazo vigilado, en UTC. */
  venceEn: Instante,
  /** `null` = no leída. */
  leidaEn: Instante.nullable(),
  creadaEn: Instante,
});
export type Notificacion = z.infer<typeof Notificacion>;

export const LIMITE_DE_NOTIFICACIONES_POR_DEFECTO = 50;
export const LIMITE_MAXIMO_DE_NOTIFICACIONES = 100;

export const ListarNotificaciones = z.object({
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITE_MAXIMO_DE_NOTIFICACIONES)
    .default(LIMITE_DE_NOTIFICACIONES_POR_DEFECTO),
});
export type ListarNotificaciones = z.infer<typeof ListarNotificaciones>;

export const ListaDeNotificaciones = z.object({
  /** No leídas primero; dentro de cada grupo, la más reciente primero. */
  datos: z.array(Notificacion),
  /** Cuántas no leídas tiene el usuario en total (no solo en esta página): el número de la campana. */
  noLeidas: z.number().int().min(0),
});
export type ListaDeNotificaciones = z.infer<typeof ListaDeNotificaciones>;
