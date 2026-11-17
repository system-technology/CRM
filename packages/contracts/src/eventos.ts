/**
 * Eventos de dominio entre contextos (ADR-0004, ADR-0024 §1). Son contrato público: quien los
 * produce y quien los consume importan el MISMO esquema de aquí (R3) y ninguno importa al otro (R4).
 *
 * **Solo identificadores.** Nada de nombres, teléfonos ni importes: el outbox no es sitio de datos
 * personales ni de dinero. Quien necesita el contenido lo lee, bajo RLS, de su dueño.
 */
import { z } from 'zod';
import { Id, Instante } from './comunes.js';

/** `quoting.cotizacion_aceptada` (v1): la cotización pasó de ENVIADA a ACEPTADA. */
export const TIPO_COTIZACION_ACEPTADA = 'quoting.cotizacion_aceptada';

export const CotizacionAceptadaV1 = z.object({
  v: z.literal(1),
  cotizacionId: Id,
  /** `cotizaciones.version_enviada`: lo aceptado es lo que vio el cliente. */
  version: z.number().int().min(1),
  contactoId: Id,
  oportunidadId: Id.nullable(),
  aceptadaPorUsuarioId: Id.nullable(),
  aceptadaEn: Instante,
});
export type CotizacionAceptadaV1 = z.infer<typeof CotizacionAceptadaV1>;
