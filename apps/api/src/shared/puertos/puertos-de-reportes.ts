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
 *
 * **Todos reciben un `AlcanceDeReporte`** (ADR-0035 §1) y no un `asesorId` suelto: el alcance lo
 * decide `alcanceDeReporte` a partir de la SESIÓN, nunca del parámetro del cliente, y un puerto
 * nuevo no compila sin él. Cada adaptador traduce el alcance a la columna con la que atribuye sus
 * filas (§2): `cotizaciones.creado_por`, `oportunidades.asesor_id`, `mensajes.autor_id`.
 */
import type { CodigoMoneda, SumasDeCobro } from '@viajapro/domain';
import type { AlcanceDeReporte } from '../autorizacion/alcance-de-reporte.js';

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
  /** Aceptadas enviadas en el rango sin fila de cambio a ACEPTADA (previas a T-132): sin fecha de venta. */
  aceptadasSinFecha: number;
  ventasPorMoneda: VentaAgregada[];
}

/**
 * Cotizaciones vivas HOY (T-528), no del rango: una foto del trabajo que espera respuesta. Los
 * tramos cuentan solo las ENVIADAS, por días completos desde `enviada_en`.
 */
export interface CotizacionesAbiertasAgregadas {
  borradores: number;
  enviadas: number;
  /** De las ENVIADAS con `enviada_en`: hasta 3 días completos esperando. */
  hastaTresDias: number;
  /** De 4 a 7. */
  deCuatroASiete: number;
  /** Más de 7. */
  masDeSiete: number;
}

/** Lo que `analytics` le pide a `quoting`. */
export abstract class PuertoCotizacionesParaReportes {
  abstract resumir(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
    incluirMargen: boolean,
  ): Promise<CotizacionesAgregadas>;

  /**
   * Sin rango a propósito: es el estado de HOY. `ahora` entra como argumento y no se lee el reloj
   * en la consulta, para que la prueba fije el instante (R9: el cálculo es en UTC).
   */
  abstract abiertas(
    tenantId: string,
    alcance: AlcanceDeReporte,
    ahora: Date,
  ): Promise<CotizacionesAbiertasAgregadas>;
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
  abstract porEtapa(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
  ): Promise<EtapaConOportunidades[]>;
}

export interface RespuestaAgregada {
  conversacionesNuevas: number;
  conversacionesRespondidas: number;
  promedioMinutos: number | null;
  medianaMinutos: number | null;
  p90Minutos: number | null;
  /** Del mismo grupo que `conversacionesNuevas`: las creadas en el rango sin primera respuesta. */
  sinResponder: number;
}

/** Lo que `analytics` le pide a `inbox`. */
export abstract class PuertoRespuestaParaReportes {
  abstract resumir(
    tenantId: string,
    rango: RangoDeReporte,
    alcance: AlcanceDeReporte,
  ): Promise<RespuestaAgregada>;
}

/**
 * Tope de archivos abiertos que se leen de una vez para el saldo por cobrar (ADR-0035 §4: el
 * cálculo es archivo por archivo con las funciones puras de `packages/domain` mientras una agencia
 * tenga hasta 500 archivos abiertos). Pasado el tope, la respuesta viene marcada `truncado` y la
 * cifra se presenta como un mínimo; moverlo a SQL es T-492, con su prueba de contrato.
 */
export const TOPE_DE_ARCHIVOS_PARA_COBRAR = 500;

/**
 * Un archivo abierto con lo justo para calcular su saldo. **Es la excepción declarada a «nunca
 * filas»** de este archivo: la fórmula del saldo no se duplica en SQL (ADR-0035 §4, T-492), así
 * que el agregado por moneda lo hace `analytics` con `packages/domain`.
 *
 * Nada de PII ni de neto: ni contacto, ni pasajeros, ni costo del mayorista (R10, §6).
 */
export interface ArchivoPorCobrar {
  moneda: CodigoMoneda;
  estado: 'ABIERTO' | 'CANCELADO';
  /** R8: unidad mínima de `moneda`. */
  ventaUnidades: bigint;
  /** Sumas de los movimientos VIGENTES del archivo. */
  sumas: SumasDeCobro;
}

export interface CobrosAgregados {
  archivos: ArchivoPorCobrar[];
  /** Había más archivos abiertos que el tope: lo que se devuelve es un mínimo. */
  truncado: boolean;
}

/**
 * Lo que `analytics` le pide a `payments` (T-528). El archivo es «propio» del asesor ACTUAL de su
 * oportunidad (ADR-0035 §2: `travel_files.oportunidad_id` → `oportunidades.asesor_id`), así que un
 * archivo sin oportunidad o sin asesor no entra en ningún reporte propio y sí en el de agencia.
 */
export abstract class PuertoCobrosParaReportes {
  abstract porCobrar(
    tenantId: string,
    alcance: AlcanceDeReporte,
    tope: number,
  ): Promise<CobrosAgregados>;
}
