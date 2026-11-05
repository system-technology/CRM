/**
 * Puerto de escritura de las etapas del pipeline (T-120). La lectura sigue en `PuertoCrm`.
 * Todo corre bajo el tenant de la petición; el adaptador no recibe `tenantId`.
 */
import type { CrearEtapa, EditarEtapa, EtapaDefinida } from '@viajapro/contracts';

export abstract class PuertoEtapas {
  /** Nace al final del embudo y sin clave. */
  abstract crear(datos: CrearEtapa): Promise<EtapaDefinida>;

  /**
   * @returns `null` si la etapa no existe en esta agencia.
   * @throws SinEtapaInicialError si el cambio dejaría el embudo sin etapa viva.
   */
  abstract editar(etapaId: string, cambios: EditarEtapa): Promise<EtapaDefinida | null>;

  /**
   * Reordena de forma atómica (una transacción: o queda todo o nada).
   * @throws OrdenDeEtapasInvalidoError si `ids` no es una permutación de las etapas actuales.
   */
  abstract reordenar(ids: ReadonlyArray<string>): Promise<EtapaDefinida[]>;
}
