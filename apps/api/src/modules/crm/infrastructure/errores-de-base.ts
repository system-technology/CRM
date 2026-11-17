/**
 * Errores que levanta la BASE con un SQLSTATE propio y que la API traduce a su error de dominio.
 *
 * `VP001` (20261115200000, T-232): el disparador `motivo_de_perdida_desde_enum` rechaza ASIGNAR
 * un motivo de pérdida desactivado. La API ya lo comprueba antes por id, pero en otra transacción
 * (carrera con una desactivación), y no lo comprueba en el camino del enum: ahí solo lo ve la base.
 *
 * Prisma 5 no expone el SQLSTATE de un `RAISE` propio en un campo estable: según el camino llega
 * en `code`, en `meta.code` o solo dentro del texto. Por eso se mira también el texto, que el
 * disparador hace empezar por `MOTIVO_DE_PERDIDA_INACTIVO:`.
 */

export const SQLSTATE_MOTIVO_DE_PERDIDA_INACTIVO = 'VP001';

// Solo el código como campo (`code: "VP001"`) o el prefijo propio del mensaje: un «VP001» suelto
// en cualquier otro texto no puede convertir un error ajeno en un 409.
const EN_EL_TEXTO = /code: "VP001"|MOTIVO_DE_PERDIDA_INACTIVO:/;

export function esMotivoDePerdidaInactivoEnBase(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; meta?: { code?: unknown } | null; message?: unknown };
  if (e.code === SQLSTATE_MOTIVO_DE_PERDIDA_INACTIVO) return true;
  if (e.meta?.code === SQLSTATE_MOTIVO_DE_PERDIDA_INACTIVO) return true;
  return typeof e.message === 'string' && EN_EL_TEXTO.test(e.message);
}
