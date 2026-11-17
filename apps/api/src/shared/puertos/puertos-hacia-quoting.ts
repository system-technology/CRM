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

/** Una línea de la versión aceptada, con lo único que `booking` necesita de ella. */
export interface LineaDeVersionAceptada {
  /** El mayorista congelado en la línea. `null` = la línea no lo trae (cae en «por definir»). */
  mayoristaId: string | null;
  mayoristaNombre: string | null;
  /** R8: unidad mínima de la moneda de la versión. `null` = neto desconocido, que no es cero. */
  netoUnidades: bigint | null;
}

/** La TRM referencial congelada en la versión (ADR-0024 §2). */
export interface TrmDeVersionAceptada {
  monedaOrigen: string;
  monedaDestino: string;
  /** Decimal exacto como texto (`numeric(18,6)`): nunca `number`. */
  valor: string;
  /** `AAAA-MM-DD`. */
  fecha: string;
  fuente: 'OFICIAL' | 'AGENCIA';
}

/**
 * Lo que `booking` necesita de la versión de una cotización ACEPTADA para abrir el archivo de viaje:
 * una copia de lo vendido, sin tocar las tablas de `quoting`.
 */
export interface VersionAceptada {
  cotizacionId: string;
  version: number;
  /** De la cotización misma, no del evento. */
  contactoId: string;
  oportunidadId: string | null;
  paqueteNombre: string;
  destino: string;
  /** `AAAA-MM-DD` (R9: `date`). */
  fechaSalida: string;
  noches: number;
  adultos: number;
  ninos: number;
  infantes: number;
  ventaUnidades: bigint;
  /** `null` = desconocido (alguna línea sin neto cargado). */
  netoUnidades: bigint | null;
  monedaIso: string;
  trm: TrmDeVersionAceptada | null;
  lineas: LineaDeVersionAceptada[];
}

/**
 * Lo que `booking` pide a `quoting` (ADR-0024 §3.1). Como `PuertoExistenciaDePaquete`: recibe la
 * TRANSACCIÓN del despachador, ya con `app.current_tenant` fijado a `outbox.tenant_id`, y el
 * `tenantId` de esa fila como defensa en profundidad. Nunca abre otra transacción ni toma el tenant
 * de un payload.
 */
export abstract class PuertoVersionAceptada {
  /**
   * `null` si la cotización no es de ese tenant, no está ACEPTADA o `version` no es la que vio el
   * cliente (`version_enviada`): lo aceptado es exactamente eso.
   */
  abstract leer(
    tx: ClienteTenant,
    tenantId: string,
    cotizacionId: string,
    version: number,
  ): Promise<VersionAceptada | null>;
}
