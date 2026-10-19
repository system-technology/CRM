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
import { OpcionDePrecio } from './vigencias.js';

export const EstadoCotizacion = z.enum(['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA']);
export type EstadoCotizacion = z.infer<typeof EstadoCotizacion>;

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
    acomodacion: Acomodacion.optional(),
    /** Hasta cuándo se honra el precio al cliente. Opcional: no todas las ofertas vencen. */
    vigenteHasta: FechaViaje.optional(),
  })
  .strict();
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
});
export type VersionDeCotizacion = z.infer<typeof VersionDeCotizacion>;

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
