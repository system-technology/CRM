/**
 * Cotizaciones guardadas: la cabecera y sus versiones inmutables.
 *
 * **El servidor recalcula, siempre.** Quien guarda manda la COMPOSICIÓN (paquete, fecha,
 * pasajeros) y nada más: ningún importe viaja en la petición. El servidor vuelve a cotizar contra
 * el tarifario de la agencia y guarda ese resultado. Aceptar importes del cliente sería aceptar
 * que una pantalla vieja, o una petición a mano, fije el precio que luego se envía al viajero.
 *
 * **La versión es una instantánea, no una referencia.** Guarda lo que se cotizó —paquete,
 * vigencia, líneas, política aplicada, importes— tal como estaba ese día. Si el mayorista sube
 * el neto mañana, la versión 1 sigue diciendo lo que dijo. Una versión no se corrige: se crea la
 * siguiente (la base lo impide con un disparador).
 *
 * Dinero en enteros con moneda (R8), fechas de viaje `AAAA-MM-DD`, instantes en UTC (R9).
 */

import { z } from 'zod';
import { Acomodacion, Dinero, FechaViaje, Id, Instante } from './comunes.js';
import { BaseDelMargen, OrigenDeLaVenta } from './politica-de-precio.js';
import { EdadesDePasajeros, OpcionDePrecio, coherenciaDeEdades } from './vigencias.js';

export const EstadoCotizacion = z.enum(['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA']);
export type EstadoCotizacion = z.infer<typeof EstadoCotizacion>;

/**
 * La TRM de una versión (ADR-0024 §2): unidades de la moneda de la agencia por 1 de la moneda de
 * las tarifas. **Referencial**: la tasa que se paga se congela en cada abono, no aquí.
 *
 * Quien guarda manda solo `valor`, `fecha` y `fuente`: el origen es la moneda de la versión y el
 * destino la de la agencia, y los pone el servidor. `valor` es un decimal exacto en texto (hasta 6
 * decimales, como `numeric(18,6)`): nunca un `number`.
 */
export const FuenteDeTrm = z.enum(['OFICIAL', 'AGENCIA']);
export type FuenteDeTrm = z.infer<typeof FuenteDeTrm>;

export const TrmDeEntrada = z
  .object({
    valor: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/, 'debe ser un decimal en texto, hasta 6 decimales')
      .refine((v) => Number(v) > 0, 'debe ser mayor que cero'),
    fecha: FechaViaje,
    fuente: FuenteDeTrm.default('AGENCIA'),
  })
  .strict();
export type TrmDeEntrada = z.infer<typeof TrmDeEntrada>;

/** La TRM congelada, tal como se lee de la versión. */
export const TrmDeVersion = z.object({
  monedaOrigen: z.string().regex(/^[A-Z]{3}$/),
  monedaDestino: z.string().regex(/^[A-Z]{3}$/),
  valor: z.string(),
  fecha: FechaViaje,
  fuente: FuenteDeTrm,
});
export type TrmDeVersion = z.infer<typeof TrmDeVersion>;

/**
 * Lo que define una versión: QUÉ se cotiza. Es la misma composición que acepta
 * `POST /api/v1/catalogo/cotizar`, sin `incluirMargen` (guardar siempre calcula el margen, para
 * poder conservarlo; leerlo es otra decisión) y con la vigencia de la oferta al cliente.
 */
export const ComposicionDeVersion = z
  .object({
    paqueteId: Id,
    fecha: FechaViaje,
    adultos: z.number().int().min(1).max(200).optional(),
    ninos: z.number().int().min(0).max(200).optional(),
    infantes: z.number().int().min(0).max(200).optional(),
    /**
     * Edades por pasajero (T-179): ver `EdadesDePasajeros`. Se guardan en la versión (T-217) y la
     * lectura las devuelve, para que volver a cotizar desde ella no pierda la tarifa de menor.
     */
    ...EdadesDePasajeros,
    acomodacion: Acomodacion.optional(),
    /** Obligatoria si el producto tiene opciones de salida (ADR-0017 §3.1). */
    opcionDeSalidaId: Id.optional(),
    /** Hasta cuándo se honra el precio al cliente. Opcional: no todas las ofertas vencen. */
    vigenteHasta: FechaViaje.optional(),
    /**
     * Solo si la versión está en una moneda distinta de la de la agencia (ADR-0024 §2). Si falta,
     * la versión queda sin TRM: el sistema no inventa una tasa.
     */
    trm: TrmDeEntrada.optional(),
  })
  .strict()
  .superRefine(coherenciaDeEdades);
export type ComposicionDeVersion = z.infer<typeof ComposicionDeVersion>;

/** `POST /api/v1/cotizaciones` — crea la cabecera y la versión 1. */
export const GuardarCotizacion = z
  .object({
    /** Por id. El módulo de cotización no sabe qué es un contacto: la base garantiza que existe. */
    contactoId: Id,
    /** Opcional; si viene debe pertenecer a ese contacto. */
    oportunidadId: Id.optional(),
    titulo: z.string().trim().min(1).max(200),
    version: ComposicionDeVersion,
  })
  .strict();
export type GuardarCotizacion = z.infer<typeof GuardarCotizacion>;

/** `POST /api/v1/cotizaciones/:id/versiones` — añade la versión siguiente. */
export const AnadirVersionACotizacion = ComposicionDeVersion;
export type AnadirVersionACotizacion = z.infer<typeof AnadirVersionACotizacion>;

/** La política que estaba vigente al cotizar. Se conserva en la versión: es parte de la prueba. */
export const PoliticaAplicada = z.object({
  porcentaje: z.number().min(0),
  base: BaseDelMargen,
  origenDeLaVenta: OrigenDeLaVenta,
  redondeoVenta: z.number().int().min(0),
});
export type PoliticaAplicada = z.infer<typeof PoliticaAplicada>;

export const VersionDeCotizacion = z.object({
  id: Id,
  /** 1, 2, 3… Estable: nunca se renumera. */
  numero: z.number().int().min(1),
  creadaEn: Instante,

  paqueteId: Id,
  paqueteNombre: z.string(),
  destino: z.string(),
  noches: z.number().int().min(0),
  fechaSalida: FechaViaje,
  vigenciaId: Id,
  vigenciaDesde: FechaViaje,
  vigenciaHasta: FechaViaje,
  deSalidaProgramada: z.boolean(),

  adultos: z.number().int().min(0),
  ninos: z.number().int().min(0),
  infantes: z.number().int().min(0),
  acomodacion: Acomodacion.nullable(),
  /**
   * Edades con las que se cotizó (T-179, T-217). Arreglo vacío = no se declararon (o la versión es
   * anterior a T-217); si no, una por niño / infante. La API las envía siempre; son opcionales en
   * el esquema solo para que una respuesta anterior a T-217 siga validando.
   */
  edadesNinos: z.array(z.number().int().min(0)).optional(),
  edadesInfantes: z.array(z.number().int().min(0)).optional(),
  /** Cuántos infantes ocupan silla propia. `null` = no se declaró (no es lo mismo que 0). */
  infantesConSilla: z.number().int().min(0).nullable().optional(),
  /**
   * La opción de salida con la que se cotizó (ADR-0017 §3.1, T-062). `null` = el producto no
   * tenía opciones, o la versión es anterior a T-062. Pasarla como `opcionDeSalidaId` al volver a
   * cotizar reproduce la misma composición. La API la envía siempre; es opcional en el esquema
   * solo para que una respuesta anterior a T-062 siga validando.
   */
  opcionDeSalidaId: Id.nullable().optional(),

  /**
   * **Solo con `incluirMargen=true`.** Con la base (`SOBRE_EL_NETO`), el porcentaje y la venta, el
   * neto sale por división: `neto = venta / (1 + porcentaje)`. Es política de margen, interna de la
   * agencia, y se omite entera —clave incluida— junto con `neto` y `margen`.
   */
  politica: PoliticaAplicada.optional(),

  /** Las líneas armadas tal como se cotizaron. Con margen solo si se pidió `incluirMargen`. */
  lineas: z.array(OpcionDePrecio),
  venta: Dinero,
  /**
   * **Solo con `incluirMargen=true`.** Revelan el neto del mayorista (`neto = venta − margen`),
   * así que se omiten enteros —no vienen en `null`— salvo que se pidan. Y `null` aquí significa
   * «desconocido» (alguna línea sin neto cargado), nunca cero.
   */
  neto: Dinero.nullable().optional(),
  margen: Dinero.nullable().optional(),

  vigenteHasta: FechaViaje.nullable(),

  /** La TRM congelada con la versión (ADR-0024 §2). `null` = sin TRM. Opcional por compatibilidad. */
  trm: TrmDeVersion.nullable().optional(),
});
export type VersionDeCotizacion = z.infer<typeof VersionDeCotizacion>;

/**
 * La composición que reproduce una versión: lo que hay que mandar a
 * `POST /api/v1/cotizaciones/:id/versiones` para volver a cotizarla (T-217).
 *
 * Reenvía edades y silla solo si la versión las declaró: un arreglo vacío con niños declarados
 * significa «no se recogieron», y mandarlo violaría `coherenciaDeEdades`. `vigenteHasta` no se
 * copia a propósito: la vigencia de la oferta es una decisión nueva en cada versión; quien quiera
 * conservarla la añade.
 */
export function composicionDesdeVersion(v: VersionDeCotizacion): ComposicionDeVersion {
  const edadesNinos = v.edadesNinos ?? [];
  const edadesInfantes = v.edadesInfantes ?? [];
  return {
    paqueteId: v.paqueteId,
    fecha: v.fechaSalida,
    adultos: v.adultos,
    ninos: v.ninos,
    infantes: v.infantes,
    ...(edadesNinos.length > 0 ? { edadesNinos: [...edadesNinos] } : {}),
    ...(edadesInfantes.length > 0 ? { edadesInfantes: [...edadesInfantes] } : {}),
    ...(v.infantesConSilla !== null && v.infantesConSilla !== undefined
      ? { infantesConSilla: v.infantesConSilla }
      : {}),
    ...(v.acomodacion ? { acomodacion: v.acomodacion } : {}),
    ...(v.opcionDeSalidaId ? { opcionDeSalidaId: v.opcionDeSalidaId } : {}),
  };
}

/** `GET /api/v1/cotizaciones/:id` — la cabecera con TODAS sus versiones, de la 1 a la última. */
export const CotizacionGuardada = z.object({
  id: Id,
  contactoId: Id,
  oportunidadId: Id.nullable(),
  titulo: z.string(),
  estado: EstadoCotizacion,
  /** La versión que el cliente recibió, si ya se envió. Nunca cambia sola. */
  versionEnviada: z.number().int().min(1).nullable(),
  enviadaEn: Instante.nullable(),
  creadaEn: Instante,
  actualizadaEn: Instante,
  versiones: z.array(VersionDeCotizacion).min(1),
});
export type CotizacionGuardada = z.infer<typeof CotizacionGuardada>;

/** `POST /api/v1/cotizaciones/:id/estado` — pide una transición del ciclo de vida. */
export const CambiarEstadoDeCotizacion = z.object({ estado: EstadoCotizacion }).strict();
export type CambiarEstadoDeCotizacion = z.infer<typeof CambiarEstadoDeCotizacion>;

/**
 * `GET /api/v1/cotizaciones` — filtros y cursor. Llegan por query string, así que `limite` se
 * coacciona. `desde`/`hasta` acotan el instante de la ÚLTIMA versión (UTC, `hasta` exclusivo).
 */
export const ListarCotizaciones = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    limite: z.coerce.number().int().min(1).max(100).default(25),
    estado: EstadoCotizacion.optional(),
    contactoId: Id.optional(),
    desde: Instante.optional(),
    hasta: Instante.optional(),
  })
  .strict();
export type ListarCotizaciones = z.infer<typeof ListarCotizaciones>;

/**
 * Una fila del listado. Lleva la venta de la última versión y cuántas hay; **nunca** neto ni
 * margen: el listado no tiene `incluirMargen`, a propósito (ADR-0011).
 */
export const FilaDeCotizacion = z.object({
  id: Id,
  contactoId: Id,
  oportunidadId: Id.nullable(),
  titulo: z.string(),
  estado: EstadoCotizacion,
  versionEnviada: z.number().int().min(1).nullable(),
  enviadaEn: Instante.nullable(),
  creadaEn: Instante,
  /** Cuándo se creó la última versión: el orden del listado, de la más reciente a la más vieja. */
  ultimaVersionEn: Instante,
  numeroDeVersiones: z.number().int().min(1),
  paqueteNombre: z.string(),
  fechaSalida: FechaViaje,
  /** El total de la última versión. */
  venta: Dinero,
});
export type FilaDeCotizacion = z.infer<typeof FilaDeCotizacion>;

export const PaginaDeCotizaciones = z.object({
  datos: z.array(FilaDeCotizacion),
  pageInfo: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
});
export type PaginaDeCotizaciones = z.infer<typeof PaginaDeCotizaciones>;
