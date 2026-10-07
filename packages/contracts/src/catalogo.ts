/**
 * Contratos del catálogo de paquetes — el corazón de la cabeza de playa.
 *
 * Ver `docs/01-producto/07-cabeza-de-playa-paquetes.md`.
 */

import { z } from 'zod';
import {
  Acomodacion,
  ComposicionPasajeros,
  Dinero,
  FechaViaje,
  Id,
  Instante,
  PlanAlimentacion,
  TipoPasajero,
} from './comunes.js';

// =============================================================================
// Mayorista
// =============================================================================

export const Mayorista = z.object({
  id: Id,
  nombre: z.string().min(1).max(200),
  contactoNombre: z.string().max(200).nullable(),
  contactoCorreo: z.string().email().nullable(),
  contactoTelefono: z.string().max(32).nullable(),
  /** Días que da el mayorista para pagar antes de liberar el cupo. */
  diasTimeLimit: z.number().int().min(0).max(365).nullable(),
  notas: z.string().nullable(),
  creadoEn: Instante,
});
export type Mayorista = z.infer<typeof Mayorista>;

export const CrearMayorista = Mayorista.pick({ nombre: true }).extend({
  contactoNombre: z.string().max(200).optional(),
  contactoCorreo: z.string().email().optional(),
  contactoTelefono: z.string().max(32).optional(),
  diasTimeLimit: z.number().int().min(0).max(365).optional(),
  notas: z.string().optional(),
});
export type CrearMayorista = z.infer<typeof CrearMayorista>;

// =============================================================================
// Precio
// =============================================================================

/**
 * Precio por temporada, acomodación y tipo de pasajero.
 *
 * `neto` NUNCA se expone a un usuario que no sea del tenant: es lo que cobra el mayorista.
 * El contrato público de cara al viajero usa `PrecioPublico`, que solo lleva la venta.
 */
export const Precio = z.object({
  id: Id,
  acomodacion: Acomodacion,
  tipoPasajero: TipoPasajero,
  neto: Dinero,
  venta: Dinero,
  /** Edad de corte. "Niño de 2 a 11 años" es condición comercial del tarifario. */
  edadMinima: z.number().int().min(0).max(120).nullable(),
  edadMaxima: z.number().int().min(0).max(120).nullable(),
});
export type Precio = z.infer<typeof Precio>;

/** Lo que ve el viajero: sin tarifa neta ni margen. */
export const PrecioPublico = Precio.omit({ neto: true });
export type PrecioPublico = z.infer<typeof PrecioPublico>;

export const CrearPrecio = z
  .object({
    acomodacion: Acomodacion,
    tipoPasajero: TipoPasajero,
    neto: Dinero,
    venta: Dinero,
    edadMinima: z.number().int().min(0).max(120).optional(),
    edadMaxima: z.number().int().min(0).max(120).optional(),
  })
  .refine((p) => p.neto.moneda === p.venta.moneda, {
    message: 'el neto y la venta deben estar en la misma moneda',
    path: ['venta'],
  })
  .refine((p) => p.edadMinima == null || p.edadMaxima == null || p.edadMinima <= p.edadMaxima, {
    message: 'la edad mínima no puede superar a la máxima',
    path: ['edadMaxima'],
  })
  .refine((p) => p.tipoPasajero !== 'ADT' || (p.edadMinima == null && p.edadMaxima == null), {
    message: 'un adulto no lleva rango de edad: el rango define a niños e infantes',
    path: ['edadMinima'],
  });
export type CrearPrecio = z.infer<typeof CrearPrecio>;

// =============================================================================
// Temporada
// =============================================================================

export const Temporada = z.object({
  id: Id,
  nombre: z.string().min(1).max(80),
  desde: FechaViaje,
  hasta: FechaViaje,
  precios: z.array(Precio),
});
export type Temporada = z.infer<typeof Temporada>;

export const CrearTemporada = z
  .object({
    nombre: z.string().min(1).max(80),
    desde: FechaViaje,
    hasta: FechaViaje,
    precios: z.array(CrearPrecio).min(1, 'una temporada sin precios no sirve para cotizar'),
  })
  .refine((t) => t.desde <= t.hasta, {
    message: 'la fecha de inicio no puede ser posterior a la de fin',
    path: ['hasta'],
  });
export type CrearTemporada = z.infer<typeof CrearTemporada>;

// =============================================================================
// Paquete
// =============================================================================

export const Paquete = z.object({
  id: Id,
  nombre: z.string().min(1).max(200),
  destino: z.string().min(1).max(120),
  paisIso: z.string().length(2).nullable(),
  dias: z.number().int().min(1).max(365),
  noches: z.number().int().min(0).max(364),
  planAlimentacion: PlanAlimentacion,
  inclusiones: z.array(z.string().max(300)),
  exclusiones: z.array(z.string().max(300)),
  descripcion: z.string().nullable(),
  activo: z.boolean(),
  mayoristaId: Id.nullable(),
  creadoEn: Instante,
});
export type Paquete = z.infer<typeof Paquete>;

export const CrearPaquete = z
  .object({
    nombre: z.string().min(1).max(200),
    destino: z.string().min(1).max(120),
    paisIso: z.string().length(2).optional(),
    dias: z.number().int().min(1).max(365),
    noches: z.number().int().min(0).max(364),
    planAlimentacion: PlanAlimentacion,
    inclusiones: z.array(z.string().max(300)).default([]),
    exclusiones: z.array(z.string().max(300)).default([]),
    descripcion: z.string().optional(),
    mayoristaId: Id.optional(),
    temporadas: z.array(CrearTemporada).default([]),
  })
  // "7 días / 6 noches" es la forma normal; "7 días / 7 noches" existe con vuelo nocturno.
  // Más de un día de diferencia es casi siempre un error de captura.
  .refine((p) => p.dias - p.noches >= 0 && p.dias - p.noches <= 1, {
    message: 'las noches deben ser iguales a los días o uno menos',
    path: ['noches'],
  });
export type CrearPaquete = z.infer<typeof CrearPaquete>;

// =============================================================================
// Cotizar un paquete
// =============================================================================

/**
 * Petición de cotización. El cliente elige paquete, fechas y cuántos van;
 * el servidor calcula. **El cálculo nunca ocurre en el navegador.**
 */
export const CotizarPaquete = z.object({
  paqueteId: Id,
  fechaSalida: FechaViaje,
  pasajeros: ComposicionPasajeros,
  /** Si no se indica, el servidor sugiere la acomodación que no deja plazas vacías. */
  acomodacion: Acomodacion.optional(),
  /** Markup adicional sobre el precio de venta del tarifario, en puntos porcentuales. */
  markupExtra: z.number().min(-100).max(500).optional(),
});
export type CotizarPaquete = z.infer<typeof CotizarPaquete>;

/** Una habitación del reparto, con cuántos la ocupan. */
export const Habitacion = z.object({
  acomodacion: Acomodacion,
  ocupantes: z.number().int().min(1),
});
export type Habitacion = z.infer<typeof Habitacion>;

/** Una línea del desglose: tantos pasajeros de este tipo, a este precio. */
export const LineaCotizacion = z.object({
  tipoPasajero: TipoPasajero,
  cantidad: z.number().int().min(1),
  precioUnitarioVenta: Dinero,
  subtotalVenta: Dinero,
  /** Solo visible para el tenant. Se omite en la vista del viajero. */
  subtotalNeto: Dinero.optional(),
});
export type LineaCotizacion = z.infer<typeof LineaCotizacion>;

export const CotizacionCalculada = z.object({
  paqueteId: Id,
  paqueteNombre: z.string(),
  destino: z.string(),
  fechaSalida: FechaViaje,
  fechaRegreso: FechaViaje,
  temporadaNombre: z.string(),
  acomodacion: Acomodacion,
  habitaciones: z.array(Habitacion),
  /**
   * Plazas pagadas y vacías. Tres personas en acomodación doble dejan una cama de más,
   * y el cliente la paga. Es la pregunta que el viajero hace siempre: se responde sin
   * que el asesor tenga que calcularla.
   */
  plazasSinUsar: z.number().int().min(0),
  lineas: z.array(LineaCotizacion),
  totalVenta: Dinero,
  /** Solo para el tenant. */
  totalNeto: Dinero.optional(),
  margen: Dinero.optional(),
  margenPorcentaje: z.number().optional(),
});
export type CotizacionCalculada = z.infer<typeof CotizacionCalculada>;
