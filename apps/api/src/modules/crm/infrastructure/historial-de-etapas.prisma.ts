/**
 * Escritura del historial de etapas de la oportunidad (T-131), compartida por los dos adaptadores
 * que cambian la etapa: el alta (`EscrituraCrmPrisma.crearOportunidad`) y el movimiento
 * (`CrmPrisma.moverOportunidad`).
 *
 * **Recibe la transacción del llamador y no abre otra.** La fila del historial y el cambio de
 * etapa se confirman juntos o no se confirma ninguno: si el INSERT falla, la excepción sale de
 * `conTenant()` y el movimiento se deshace. Un historial escrito «después» tendría huecos justo
 * cuando más importa (un fallo a mitad).
 *
 * La tabla es de solo añadir (lo impone un disparador): aquí no hay ni puede haber un UPDATE.
 * Sin PII (R10): identificadores, banderas y el motivo; la nota de pérdida no viaja.
 */
import type { MotivoPerdida } from '@viajapro/contracts';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';

export interface CambioDeEtapa {
  tenantId: string;
  oportunidadId: string;
  /** `ALTA` al crear; `CAMBIO` al mover. `MIGRACION` solo lo escribe la migración. */
  origen: 'ALTA' | 'CAMBIO';
  /** Nula en el alta. */
  etapaDesdeId: string | null;
  etapaHastaId: string;
  /** Copiadas de la etapa destino EN ESTE MOMENTO, no de la etapa viva de mañana. */
  esGanada: boolean;
  esPerdida: boolean;
  motivoPerdida: MotivoPerdida | null;
  /** El asesor asignado a la oportunidad en este instante. */
  asesorId: string | null;
  /** Quién hace el cambio; nulo si no hay usuario (automatización, atajo de desarrollo). */
  usuarioId: string | null;
}

/**
 * Añade la fila y devuelve el `ocurrido_en` que quedó guardado: el mismo valor sirve después para
 * `oportunidades.cerrada_en`, así que cierre e historial no discrepan ni en un milisegundo.
 */
export async function registrarCambioDeEtapa(tx: ClienteTenant, c: CambioDeEtapa): Promise<Date> {
  const fila = await tx.oportunidadCambioEtapa.create({
    data: {
      tenantId: c.tenantId,
      oportunidadId: c.oportunidadId,
      origen: c.origen,
      etapaDesdeId: c.etapaDesdeId,
      etapaHastaId: c.etapaHastaId,
      esGanada: c.esGanada,
      esPerdida: c.esPerdida,
      motivoPerdida: c.esPerdida ? c.motivoPerdida : null,
      asesorId: c.asesorId,
      usuarioId: c.usuarioId,
    },
    select: { ocurridoEn: true },
  });
  return fila.ocurridoEn;
}
