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
  ParametrosPagina,
  PlanAlimentacion,
  TipoPasajero,
} from './comunes.js';
import { CargoEnDestino } from './vigencias.js';

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
  /** Solo con `incluirMargen=true`: sin el flag la clave no existe en la respuesta. */
  neto: Dinero.optional(),
  venta: Dinero,
  /** Edad de corte. "Niño de 2 a 11 años" es condición comercial del tarifario. */
  edadMinima: z.number().int().min(0).max(120).nullable(),
  edadMaxima: z.number().int().min(0).max(120).nullable(),
});
export type Precio = z.infer<typeof Precio>;

/** Lo que ve el viajero: sin tarifa neta ni margen. */
export const PrecioPublico = Precio.omit({ neto: true });
export type PrecioPublico = z.infer<typeof PrecioPublico>;

/** @deprecated ADR-0017: el precio vive en `Tarifa` (vigencias). Se retira con las temporadas. */
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

/** @deprecated ADR-0017: la temporada se reemplazó por la vigencia (`vigencias.ts`). */
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
  /** ADR-0017 M2. Opcionales en el esquema: las respuestas previas a M2 no los traen. */
  codigo: z.string().nullable().optional(),
  formato: z.object({ id: Id, nombre: z.string() }).nullable().optional(),
  /** Se muestran aparte y NUNCA entran en el total de una cotización. */
  cargosEnDestino: z.array(CargoEnDestino).optional(),
  camposPersonalizados: z.record(z.unknown()).optional(),
  opcionesDeSalida: z
    .array(
      z.object({
        id: Id,
        etiqueta: z.string(),
        horaSalida: z.string().nullable(),
        horaRegreso: z.string().nullable(),
        puntoDeEncuentro: z.string().nullable(),
        orden: z.number().int(),
        activa: z.boolean(),
      }),
    )
    .optional(),
});
export type Paquete = z.infer<typeof Paquete>;

/** Campos que el formulario de alta y el de edición comparten. */
const CamposDePaquete = z.object({
  nombre: z.string().min(1).max(200),
  destino: z.string().min(1).max(120),
  dias: z.number().int().min(1).max(365),
  noches: z.number().int().min(0).max(364),
  /** `null` = el producto no tiene alimentación que declarar (un pasadía). */
  planAlimentacion: PlanAlimentacion.nullable().optional(),
  inclusiones: z.array(z.string().max(300)).optional(),
  exclusiones: z.array(z.string().max(300)).optional(),
  /** Clave natural preferente (ADR-0017 §3). */
  codigo: z.string().min(1).max(64).optional(),
  /** Nombre de un formato de viaje de la agencia. */
  formato: z.string().min(1).max(80).optional(),
});

// "7 días / 6 noches" es la forma normal; "7 días / 7 noches" existe con vuelo nocturno.
// Más de un día de diferencia es casi siempre un error de captura.
const coherenciaDeNoches = (p: { dias?: number | undefined; noches?: number | undefined }) =>
  p.dias === undefined ||
  p.noches === undefined ||
  (p.dias - p.noches >= 0 && p.dias - p.noches <= 1);
const MENSAJE_NOCHES = {
  message: 'las noches deben ser iguales a los días o uno menos',
  path: ['noches'],
};

/**
 * Alta de un producto desde la pantalla (`POST /api/v1/catalogo/paquetes`). Sin temporadas ni
 * mayorista: los precios entran por vigencias y el mayorista es de la tarifa (ADR-0017 §4.1).
 * `.strict()`: un `tenantId` en el cuerpo es un 400, no se ignora.
 */
export const CrearPaquete = CamposDePaquete.strict().refine(coherenciaDeNoches, MENSAJE_NOCHES);
export type CrearPaquete = z.infer<typeof CrearPaquete>;

/** Edición parcial (`PATCH /api/v1/catalogo/paquetes/:id`): solo lo que viene cambia. */
export const EditarPaquete = CamposDePaquete.partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'no hay nada que cambiar' })
  .refine(coherenciaDeNoches, MENSAJE_NOCHES);
export type EditarPaquete = z.infer<typeof EditarPaquete>;

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
  /**
   * Pide el neto del mayorista y el margen. Sin esto la respuesta no lleva `totalNeto`,
   * `margen`, `margenPorcentaje` ni `subtotalNeto`: R10. El permiso para pedirlo lo añade
   * la autenticación; aquí solo se garantiza que, sin el flag, no viaja nada.
   */
  incluirMargen: z.boolean().optional(),
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
  /** Solo con `incluirMargen=true`; sin el flag la clave no viaja. */
  totalNeto: Dinero.optional(),
  margen: Dinero.optional(),
  margenPorcentaje: z.number().optional(),
});
export type CotizacionCalculada = z.infer<typeof CotizacionCalculada>;

// =============================================================================
// Listado de gestión (ADR-0017 §4.1, T-044)
// =============================================================================

/**
 * Parámetros de `GET /api/v1/catalogo/paquetes`. Viajan en la cadena de consulta, así que los
 * números llegan como texto: `limite` se coacciona. `incluirInactivos` solo es `true` con la
 * cadena `true`; cualquier otro valor es el seguro (no incluir).
 */
export const ParametrosListadoGestion = ParametrosPagina.extend({
  limite: z.coerce.number().int().min(1).max(100).default(25),
  incluirInactivos: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ParametrosListadoGestion = z.infer<typeof ParametrosListadoGestion>;

/**
 * Una fila del listado de gestión: el paquete más su «desde» **derivado** (nunca persistido).
 *
 * `desde` es una lista con un mínimo por moneda —nunca un número que mezcle COP y USD— y es `[]`
 * si el paquete no tiene tarifas base vigentes («a consultar»). `desdeEsDeGrupo` es `true` si
 * alguno de esos mínimos es el per cápita de una tarifa de grupo. No lleva neto.
 */
export const ResumenDePaqueteGestion = Paquete.extend({
  /** Nulo = no aplica o no se declaró (un pasadía no tiene régimen, ADR-0017 M2). */
  planAlimentacion: PlanAlimentacion.nullable(),
  desde: z.array(Dinero),
  desdeEsDeGrupo: z.boolean(),
  vigenciasActivas: z.number().int().min(0),
});
export type ResumenDePaqueteGestion = z.infer<typeof ResumenDePaqueteGestion>;
