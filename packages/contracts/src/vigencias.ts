/**
 * Vigencias, salidas y tarifas — el catálogo tal como ADR-0009 lo decide.
 *
 * **La idea central, en una frase:** una tarifa es un precio válido para una **ventana de fechas de
 * salida**. Una salida programada es la ventana de **un solo día**, publicada. Una vigencia abierta
 * es la ventana de un rango.
 *
 * Por eso aquí hay **una** entidad `Vigencia` y no dos: `Salida` no es una tabla rival, es una
 * vigencia con `desde === hasta` y `publicada`. Esa unificación es lo que permite que las agencias
 * que venden con fecha publicada y las que cotizan contra fecha elegida por el cliente compartan
 * **una sola función de resolución** — ver `resolverVigencia` en `@viajapro/domain`.
 *
 * Ver ADR-0009 §1 y §4.
 */

import { z } from 'zod';
import { Acomodacion, Dinero, FechaViaje, Id, Instante, TipoPasajero } from './comunes.js';

/**
 * Eje 1 de ADR-0009: cómo publica su catálogo la agencia.
 *
 * **Afecta a las altas y a la interfaz, nunca al cálculo.** Ese límite es la decisión: el día que
 * una ruta de cotización ramifique sobre este valor, habremos duplicado el cotizador sin decidirlo.
 */
export const ModoDeCatalogo = z.enum(['SALIDAS_PUBLICADAS', 'VIGENCIA_ABIERTA', 'AMBOS']);
export type ModoDeCatalogo = z.infer<typeof ModoDeCatalogo>;

/**
 * El denominador de la tarifa. **Es aritmética, no política**: por eso es un `enum` cerrado y no
 * una tabla por tenant (R12).
 *
 * `POR_GRUPO` con `cubrePasajeros` absorbe la promo de pareja (n = 2) y el precio de grupo (n > 2).
 * No existe `POR_PAREJA` —sería redundante— ni `POR_VEHICULO`: el vehículo es un costo.
 */
export const UnidadDeCobro = z.enum(['POR_PERSONA', 'POR_GRUPO']);
export type UnidadDeCobro = z.infer<typeof UnidadDeCobro>;

/**
 * Cuándo aplica una tarifa. **Declarativa y cerrada, no una expresión evaluable**: un motor de
 * reglas en el catálogo sería el nivel 5 que ADR-0006 prohíbe. Si aparece un caso que no cabe, se
 * añade un campo, no un lenguaje.
 *
 * Todo en `null` significa «aplica siempre», que es el caso de la mayoría del tarifario real.
 */
export const CondicionDeTarifa = z
  .object({
    acomodacion: Acomodacion.nullable(),
    tipoPasajero: TipoPasajero.nullable(),
    edadMinima: z.number().int().min(0).max(120).nullable(),
    edadMaxima: z.number().int().min(0).max(120).nullable(),
    pasajerosMinimo: z.number().int().min(1).max(200).nullable(),
    pasajerosMaximo: z.number().int().min(1).max(200).nullable(),
    /** Un infante en brazos no ocupa silla y casi nunca paga igual. */
    ocupaSilla: z.boolean().nullable(),
  })
  .refine((c) => c.edadMinima === null || c.edadMaxima === null || c.edadMinima <= c.edadMaxima, {
    message: 'la edad mínima no puede superar a la máxima',
    path: ['edadMaxima'],
  })
  .refine(
    (c) =>
      c.pasajerosMinimo === null ||
      c.pasajerosMaximo === null ||
      c.pasajerosMinimo <= c.pasajerosMaximo,
    { message: 'el mínimo de pasajeros no puede superar al máximo', path: ['pasajerosMaximo'] },
  );
export type CondicionDeTarifa = z.infer<typeof CondicionDeTarifa>;

/** «Aplica siempre». Es lo que lleva la inmensa mayoría de las líneas de un tarifario real. */
export const CONDICION_SIEMPRE: CondicionDeTarifa = {
  acomodacion: null,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
};

const TarifaBase = z.object({
  id: Id,
  /** Lo que ve el asesor: «Adulto», «Menor de 2 a 11», «Promo pareja», «Suplemento sencilla». */
  nombre: z.string().min(1).max(80),
  unidad: UnidadDeCobro,
  /** Cuántos pasajeros cubre el importe. Siempre 1 en `POR_PERSONA`. */
  cubrePasajeros: z.number().int().min(1).max(200),
  /**
   * Lo que cobra el mayorista. **Nulo es legítimo**: la tarifa cotiza igual y el margen sale
   * como desconocido, que es la verdad mientras no llegue la hoja de netos (ADR-0009 §5).
   */
  neto: Dinero.nullable(),
  venta: Dinero,
  /** De quién se compra ESTA silla en ESTA fecha. Dos vigencias pueden tener mayoristas distintos. */
  mayoristaId: Id.nullable(),
  /** Si suma al precio base en vez de reemplazarlo: así es el suplemento de sencilla. */
  aditiva: z.boolean(),
  condicion: CondicionDeTarifa,
});

/** Las dos invariantes de una tarifa, aplicadas igual al leerla que al crearla. */
const coherenciaDeTarifa = <T extends z.ZodTypeAny>(esquema: T) =>
  esquema
    .refine(
      (t: z.infer<typeof TarifaBase>) => t.unidad !== 'POR_PERSONA' || t.cubrePasajeros === 1,
      {
        message: 'una tarifa por persona cubre exactamente a una persona',
        path: ['cubrePasajeros'],
      },
    )
    .refine(
      (t: z.infer<typeof TarifaBase>) => t.neto === null || t.neto.moneda === t.venta.moneda,
      {
        message: 'el neto y la venta deben estar en la misma moneda',
        path: ['neto'],
      },
    );

export const Tarifa = coherenciaDeTarifa(TarifaBase);
export type Tarifa = z.infer<typeof Tarifa>;

/** Lo que ve el viajero. **`neto` no sale del tenant nunca** (ADR-0009 §3). */
export const TarifaPublica = TarifaBase.omit({ neto: true, mayoristaId: true });
export type TarifaPublica = z.infer<typeof TarifaPublica>;

/**
 * La ventana a la que cuelga el precio.
 *
 * Con `desde === hasta` y `publicada`, **esto es una salida programada**: la fecha concreta que el
 * cliente ve en la pieza de WhatsApp. Con un rango, es una vigencia abierta y el cliente elige el
 * día. El cotizador no distingue: resuelve.
 */
export const Vigencia = z
  .object({
    id: Id,
    paqueteId: Id,
    desde: FechaViaje,
    hasta: FechaViaje,
    /** Publicada = el cliente la ve como fecha ofrecida. Sin publicar = solo sirve para cotizar. */
    publicada: z.boolean(),
    /**
     * Cupo **informativo**. Para un revendedor el inventario es del mayorista: la disponibilidad
     * se pregunta, no se calcula. Nulo es lo normal.
     */
    cupoTotal: z.number().int().min(0).max(1000).nullable(),
    tarifas: z.array(Tarifa),
    creadaEn: Instante,
  })
  .refine((v) => v.desde <= v.hasta, {
    message: 'la fecha de inicio no puede ser posterior a la de fin',
    path: ['hasta'],
  })
  .refine((v) => !v.publicada || v.desde === v.hasta, {
    message: 'solo se publica una fecha concreta: una vigencia abierta no es una salida',
    path: ['publicada'],
  });
export type Vigencia = z.infer<typeof Vigencia>;

/** Una vigencia publicada de un solo día es lo que el sector llama «salida». */
export function esSalidaProgramada(v: Pick<Vigencia, 'desde' | 'hasta' | 'publicada'>): boolean {
  return v.publicada && v.desde === v.hasta;
}

export const CrearTarifa = coherenciaDeTarifa(
  TarifaBase.omit({ id: true }).extend({
    cubrePasajeros: z.number().int().min(1).max(200).default(1),
    neto: Dinero.nullable().default(null),
    mayoristaId: Id.nullable().default(null),
    aditiva: z.boolean().default(false),
    condicion: CondicionDeTarifa.default(CONDICION_SIEMPRE),
  }),
);
export type CrearTarifa = z.infer<typeof CrearTarifa>;

export const CrearVigencia = z
  .object({
    paqueteId: Id,
    desde: FechaViaje,
    hasta: FechaViaje,
    publicada: z.boolean().default(false),
    cupoTotal: z.number().int().min(0).max(1000).nullable().default(null),
    tarifas: z.array(CrearTarifa).min(1, 'una vigencia sin tarifas no sirve para cotizar'),
  })
  .refine((v) => v.desde <= v.hasta, {
    message: 'la fecha de inicio no puede ser posterior a la de fin',
    path: ['hasta'],
  })
  .refine((v) => !v.publicada || v.desde === v.hasta, {
    message: 'solo se publica una fecha concreta: una vigencia abierta no es una salida',
    path: ['publicada'],
  });
export type CrearVigencia = z.infer<typeof CrearVigencia>;

/**
 * Cotizar: paquete y fecha. **La composición de pasajeros es opcional a propósito.**
 *
 * Eje 3 de ADR-0009: si las tarifas aplicables traen condición de acomodación o de tipo de
 * pasajero, el cotizador la pide; si no, no. **Se deriva del dato**, no de un interruptor que
 * pueda contradecir al tarifario.
 */
export const CotizarSalida = z.object({
  paqueteId: Id,
  fecha: FechaViaje,
  adultos: z.number().int().min(1).max(200).optional(),
  ninos: z.number().int().min(0).max(200).optional(),
  infantes: z.number().int().min(0).max(200).optional(),
  acomodacion: Acomodacion.optional(),
});
export type CotizarSalida = z.infer<typeof CotizarSalida>;

/** Por qué no se pudo resolver una fecha. Se devuelve tal cual para que la pantalla lo explique. */
export const MotivoSinTarifa = z.enum([
  'SIN_VIGENCIA',
  'VIGENCIAS_EMPATADAS',
  'SIN_TARIFA_APLICABLE',
]);
export type MotivoSinTarifa = z.infer<typeof MotivoSinTarifa>;
