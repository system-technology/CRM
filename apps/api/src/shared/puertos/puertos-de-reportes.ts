/**
 * Los puertos por los que `analytics` pide AGREGADOS a los contextos dueños de los datos, sin
 * importarlos ni tocar sus tablas (R4, ADR-0004). Mismo esquema que `puertos-hacia-crm.ts`: los
 * define quien los necesita, viven en `shared/`, el dueño los implementa y los registra.
 *
 * Cada puerto abre su propia transacción corta bajo el tenant de la petición (RLS) y recibe el
 * `tenantId` explícito para el predicado de defensa en profundidad (R1). Devuelven agregados ya
 * calculados en la base: nunca filas, para que pedir un reporte no cueste leer cada cotización.
 *
 * El rango es `[desde, hasta)` en UTC (R9).
 */
import type { CodigoMoneda } from '@viajapro/domain';

export interface RangoDeReporte {
  /** Inclusivo. */
  readonly desde: Date;
  /** Exclusivo. */
  readonly hasta: Date;
}

/** Venta de una moneda. Enteros en la unidad mínima; las monedas nunca se suman entre sí (R8). */
export interface VentaAgregada {
  moneda: CodigoMoneda;
  cotizacionesAceptadas: number;
  ventaUnidades: bigint;
  /** Presente SOLO si se pidió el margen. Sin el permiso, ni siquiera se consulta. */
  margen?: {
    /** `null` si ninguna cotización de esta moneda tiene neto conocido. */
    netoUnidades: bigint | null;
    margenUnidades: bigint | null;
    /** Venta de las cotizaciones con neto conocido: la base honesta del porcentaje. */
    ventaConNetoUnidades: bigint;
    cotizacionesSinNeto: number;
  };
}

export interface CotizacionesAgregadas {
  creadas: number;
  enviadas: number;
  /** De las enviadas en el rango, las que hoy están aceptadas. */
  aceptadas: number;
  ventasPorMoneda: VentaAgregada[];
}

/** Lo que `analytics` le pide a `quoting`. */
export abstract class PuertoCotizacionesParaReportes {
  abstract resumir(
    tenantId: string,
    rango: RangoDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesAgregadas>;
}

export interface EtapaConOportunidades {
  etapaId: string;
  nombre: string;
  orden: number;
  esGanada: boolean;
  esPerdida: boolean;
  /** Oportunidades CREADAS en el rango que hoy están en esta etapa. */
  cantidad: number;
}

/** Lo que `analytics` le pide a `crm`. Una entrada por etapa de la agencia, también las vacías. */
export abstract class PuertoOportunidadesParaReportes {
  abstract porEtapa(tenantId: string, rango: RangoDeReporte): Promise<EtapaConOportunidades[]>;
}

export interface RespuestaAgregada {
  conversacionesNuevas: number;
  conversacionesRespondidas: number;
  promedioMinutos: number | null;
  medianaMinutos: number | null;
}

/** Lo que `analytics` le pide a `inbox`. */
export abstract class PuertoRespuestaParaReportes {
  abstract resumir(tenantId: string, rango: RangoDeReporte): Promise<RespuestaAgregada>;
}
