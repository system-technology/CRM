/**
 * Los puertos por los que otros contextos piden cosas a `quoting` sin importarlo ni tocar sus
 * tablas. R4 y ADR-0004. Mismo esquema que `puertos-hacia-crm.ts`: los define quien los necesita,
 * viven en `shared/`, `quoting` los implementa y los registra con estos símbolos.
 *
 * Los de `crm` reciben la transacción `tx` del llamador (ya con `app.current_tenant` fijado) y el
 * `tenantId` explícito como defensa en profundidad (R1).
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';

/** Lo que `crm` necesita de `quoting`: comprobar que un paquete del catálogo existe. */
export abstract class PuertoExistenciaDePaquete {
  /** El paquete existe en ese tenant y no está eliminado. */
  abstract existePaquete(tx: ClienteTenant, tenantId: string, paqueteId: string): Promise<boolean>;
}

/**
 * Lo que `inbox` pide a `quoting`. `quoting` arma el TEXTO; `inbox` solo lo envía. Así el formato
 * del mensaje (producto, fecha, pasajeros, total, cargos en destino) es una regla de cotización y
 * no se filtra a la bandeja.
 */
export interface CotizacionParaWhatsapp {
  cotizacionId: string;
  /** El contacto al que se cotizó: `inbox` comprueba que sea el de la conversación. */
  contactoId: string;
  /** La versión efectivamente armada (la pedida, o la última si no se pidió ninguna). */
  version: number;
  /** Texto con formato de WhatsApp, listo para enviar. Nunca contiene neto ni margen. */
  texto: string;
}

export abstract class PuertoCotizacionParaWhatsapp {
  /**
   * `null` si la cotización o la versión no existen en ESE tenant. Lee bajo RLS en su propia
   * transacción corta, sin red dentro.
   */
  abstract textoDeVersion(
    tenantId: string,
    cotizacionId: string,
    version: number | undefined,
  ): Promise<CotizacionParaWhatsapp | null>;
}
