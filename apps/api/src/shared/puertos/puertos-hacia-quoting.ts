/**
 * Lo que `inbox` pide a `quoting` sin importarlo (R4, ADR-0004). Lo define quien lo necesita y vive
 * en `shared/` por la misma razón que `puertos-hacia-crm.ts`: `quoting` tiene que implementarlo y no
 * debe importar archivos de `inbox`.
 *
 * `quoting` arma el TEXTO; `inbox` solo lo envía. Así el formato del mensaje (producto, fecha,
 * pasajeros, total, cargos en destino) es una regla de cotización y no se filtra a la bandeja.
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
