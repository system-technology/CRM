/**
 * Puerto de lectura del estado del canal de WhatsApp (T-122). Corre bajo el tenant de la
 * petición; no recibe `tenantId`. Devuelve solo lo seguro de mostrar: nunca columnas de token.
 */
import type { CanalWhatsappEstado } from '@viajapro/contracts';

export abstract class PuertoEstadoDelCanal {
  /** Los números no eliminados de la agencia, con su actividad reciente. */
  abstract canalesDeLaAgencia(): Promise<CanalWhatsappEstado[]>;
}
