/**
 * El plazo de PRIMERA respuesta de una conversación (SLA).
 *
 * **Política por defecto, no dato de la agencia (todavía).** No existe tabla de política de
 * atención: T-135 la crea (`minutos_sla_primera_respuesta`, por defecto 15, por tenant, R12) y
 * hasta que llegue esta constante es el valor que T-135 declara por defecto. Cuando exista la
 * tabla, quien llama pasa los minutos de la agencia y esta constante deja de usarse.
 *
 * Reglas, en un solo sitio:
 *   1. El plazo se fija con el primer entrante de una conversación sin respuesta pendiente de
 *      SLA: `sla_vence_en = instante del mensaje (el de Meta, no el de proceso) + plazo`.
 *   2. Si ya hay un plazo corriendo, un entrante posterior NO lo mueve (el cliente que insiste
 *      no gana tiempo para la agencia).
 *   3. Si ya hubo primera respuesta, no se arma de nuevo: `primera_respuesta_en` se fija una sola
 *      vez en la vida de la conversación y la proyección anula `slaVenceEn` al responder, sin
 *      borrar el plazo (es la evidencia de si se cumplió). Episodios por silencio: T-136.
 */
export const MINUTOS_SLA_PRIMERA_RESPUESTA_POR_DEFECTO = 15;

export interface EstadoDelSla {
  slaVenceEn: Date | null;
  primeraRespuestaEn: Date | null;
}

/** El nuevo `sla_vence_en`, o `null` si no hay que tocarlo. */
export function slaTrasEntrante(
  actual: EstadoDelSla,
  instanteDelEntrante: Date,
  minutos: number = MINUTOS_SLA_PRIMERA_RESPUESTA_POR_DEFECTO,
): Date | null {
  if (actual.primeraRespuestaEn !== null || actual.slaVenceEn !== null) return null;
  return new Date(instanteDelEntrante.getTime() + minutos * 60_000);
}
