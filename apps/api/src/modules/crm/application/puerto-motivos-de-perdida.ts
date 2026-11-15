/**
 * Puerto de los motivos de pérdida de la agencia (T-229, R12). Todo corre bajo el tenant de la
 * petición; el adaptador no recibe `tenantId`.
 */
import type {
  ActualizarMotivoDePerdida,
  CrearMotivoDePerdida,
  MotivoDePerdida,
} from '@viajapro/contracts';

export abstract class PuertoMotivosDePerdida {
  /** En su orden. Por defecto solo los activos. */
  abstract listar(incluirInactivos: boolean): Promise<MotivoDePerdida[]>;

  /** `null` si no existe en esta agencia (un id ajeno es «no existe»). Devuelve inactivos. */
  abstract buscar(id: string): Promise<MotivoDePerdida | null>;

  /** Nace activo, al final y sin clave. @throws EtiquetaDeMotivoRepetidaError */
  abstract crear(datos: CrearMotivoDePerdida, actorId: string | null): Promise<MotivoDePerdida>;

  /** @returns `null` si no existe en esta agencia. @throws EtiquetaDeMotivoRepetidaError */
  abstract actualizar(
    id: string,
    cambios: ActualizarMotivoDePerdida,
    actorId: string | null,
  ): Promise<MotivoDePerdida | null>;
}
