/**
 * El puerto de salida del caso de uso de apertura: dónde se guarda el archivo de viaje. Clase
 * abstracta y no interfaz: Nest necesita un símbolo en ejecución para inyectarla.
 *
 * Recibe la transacción del despachador (ya con `app.current_tenant` fijado): nunca abre otra.
 */
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type { ArchivoPorAbrir } from '../domain/archivo-de-viaje.js';

export interface ResultadoDeApertura {
  travelFileId: string;
  /** El número de file legible («file 1043»). */
  numero: number;
  /** `false` = esa cotización ya tenía archivo: no se creó nada. */
  creado: boolean;
}

export abstract class RepositorioDeArchivos {
  /**
   * Abre el archivo con sus reservas y le asigna el siguiente número de file de la agencia.
   * Idempotente por cotización (`UNIQUE (tenant_id, cotizacion_id)`): si ya existe, lo devuelve
   * con `creado: false` y no escribe nada.
   */
  abstract abrir(
    tx: ClienteTenant,
    tenantId: string,
    archivo: ArchivoPorAbrir,
  ): Promise<ResultadoDeApertura>;
}
