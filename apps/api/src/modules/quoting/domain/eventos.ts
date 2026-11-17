/**
 * Los eventos de dominio que `quoting` produce (ADR-0024 §1). Lógica pura: arma el evento y lo
 * valida con el MISMO esquema que usa el consumidor (`@viajapro/contracts`, R3). No sabe de la base.
 */
import { CotizacionAceptadaV1, TIPO_COTIZACION_ACEPTADA } from '@viajapro/contracts';
import { InvariantError } from '@viajapro/domain';

/** Lo que se escribe en el outbox, sin el tenant (lo pone quien escribe, del contexto). */
export interface EventoParaOutbox {
  agregado: string;
  agregadoId: string;
  tipoEvento: string;
  versionEvento: number;
  payload: CotizacionAceptadaV1;
}

/** Una cotización ACEPTADA siempre fue ENVIADA antes, y ENVIADA exige versión (CHECK de la base). */
export class CotizacionAceptadaSinVersionError extends InvariantError {
  readonly code = 'COTIZACION_ACEPTADA_SIN_VERSION';
  constructor(readonly cotizacionId: string) {
    super(`La cotización ${cotizacionId} se acepta sin versión enviada: estado imposible`);
  }
}

export function cotizacionAceptada(entrada: {
  cotizacionId: string;
  versionEnviada: number | null;
  contactoId: string;
  oportunidadId: string | null;
  aceptadaPorUsuarioId: string | null;
  aceptadaEn: Date;
}): EventoParaOutbox {
  if (entrada.versionEnviada === null) {
    throw new CotizacionAceptadaSinVersionError(entrada.cotizacionId);
  }
  return {
    agregado: 'cotizacion',
    agregadoId: entrada.cotizacionId,
    tipoEvento: TIPO_COTIZACION_ACEPTADA,
    versionEvento: 1,
    // Solo identificadores: sin datos personales ni importes.
    payload: CotizacionAceptadaV1.parse({
      v: 1,
      cotizacionId: entrada.cotizacionId,
      version: entrada.versionEnviada,
      contactoId: entrada.contactoId,
      oportunidadId: entrada.oportunidadId,
      aceptadaPorUsuarioId: entrada.aceptadaPorUsuarioId,
      aceptadaEn: entrada.aceptadaEn.toISOString(),
    }),
  };
}
