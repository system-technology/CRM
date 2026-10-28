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
import { PresentacionDePrecio } from './politica-de-precio.js';

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
const coherenciaDeTarifa = <T extends z.ZodTypeAny>(
  esquema: T,
): z.ZodEffects<z.ZodEffects<T, z.output<T>, z.input<T>>, z.output<T>, z.input<T>> =>
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
    ) as z.ZodEffects<z.ZodEffects<T, z.output<T>, z.input<T>>, z.output<T>, z.input<T>>;

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
  /**
   * La opción de salida elegida (turno, modalidad). Obligatoria cuando el producto tiene opciones
   * activas: sin ella la cotización responde `OPCION_DE_SALIDA_REQUERIDA`. ADR-0017 §3.1.
   */
  opcionDeSalidaId: Id.optional(),

  /**
   * Traer el margen de cada línea. **Por defecto NO**, y es deliberado.
   *
   * El margen revela el neto por resta. Lo pide la pantalla del asesor, que sabe lo que hace;
   * cualquier otra cosa que llame a esta ruta recibe una cotización sin él. Cuando exista
   * autenticación, esto además se comprobará contra el rol — pero el valor por defecto seguro
   * vale hoy y no cuesta nada.
   */
  incluirMargen: z.boolean().default(false),
});
export type CotizarSalida = z.infer<typeof CotizarSalida>;

/** Por qué no se pudo resolver una fecha. Se devuelve tal cual para que la pantalla lo explique. */
export const MotivoSinTarifa = z.enum([
  'SIN_VIGENCIA',
  'VIGENCIAS_EMPATADAS',
  'SIN_TARIFA_APLICABLE',
]);
export type MotivoSinTarifa = z.infer<typeof MotivoSinTarifa>;

// =============================================================================
// Lo que la API devuelve
// =============================================================================

/**
 * Una salida publicada, como se lista en el catálogo de la agencia.
 *
 * `desde` es la tarifa **más barata** de esa salida, que es como se anuncia un viaje en este
 * mercado: «Parque del café, 3 de octubre, desde $275.000».
 */
export const SalidaPublicada = z.object({
  vigenciaId: Id,
  paqueteId: Id,
  paqueteNombre: z.string(),
  destino: z.string(),
  noches: z.number().int().min(0),
  fecha: FechaViaje,
  cupoTotal: z.number().int().nullable(),
  /**
   * El «desde» de la primera moneda por código (COP antes que USD). Se conserva para quien aún
   * lee un solo precio; con una salida en varias monedas NO es todo el cuadro: usar
   * `desdePorMoneda`.
   */
  desde: Dinero,
  /**
   * Un mínimo por moneda, ordenado por código, igual que el listado de gestión: nunca un número
   * que mezcle COP y USD. Opcional en el esquema por compatibilidad con respuestas previas; la API
   * siempre lo envía y su primer elemento es `desde`.
   */
  desdePorMoneda: z.array(Dinero).min(1).optional(),
  /** Cómo pintar el «desde» según la política `promo_vencida` (`presentarPrecio`). */
  presentacion: PresentacionDePrecio.optional(),
  /** Cómo pintar cada elemento de `desdePorMoneda`, en el mismo orden. */
  presentacionPorMoneda: z.array(PresentacionDePrecio).min(1).optional(),
  /**
   * `true` cuando algún «desde» (de cualquier moneda) sale de una tarifa de GRUPO y es su per cápita — «$140.000 por
   * persona, en promo de pareja».
   *
   * La pantalla **tiene que decirlo**: una persona sola no puede comprar esa tarifa, y un
   * titular que promete un precio condicionado sin nombrar la condición es publicidad engañosa.
   * Esconder el producto habría sido peor —existe y la agencia lo vende—, así que se enseña con
   * su letra pequeña al lado.
   */
  desdeEsDeGrupo: z.boolean(),
  /** Cuántas tarifas distintas tiene. Más de una significa que hay promoción o condición. */
  tarifas: z.number().int().min(1),
});
export type SalidaPublicada = z.infer<typeof SalidaPublicada>;

/**
 * Una forma de cobrar este viaje a este grupo.
 *
 * **Se devuelven TODAS las que aplican, no una.** Si dos personas van a un pasadía que además
 * tiene promo de pareja, el asesor ve las dos y elige: «por persona son $378.000, en promo de
 * pareja $280.000». Elegir por él en silencio sería esconderle una decisión comercial que es
 * suya — y la barata no siempre es la que quiere, porque la promo puede tener condiciones.
 */
export const OpcionDePrecio = z.object({
  tarifaId: Id,
  nombre: z.string(),
  unidad: UnidadDeCobro,
  cubrePasajeros: z.number().int().min(1),
  /** Cuántas veces se cobra: pasajeros en `POR_PERSONA`, grupos en `POR_GRUPO`. */
  veces: z.number().int().min(1),
  precioUnitario: Dinero,
  total: Dinero,
  /**
   * **Solo para el tenant, y por eso NO viene salvo que se pida** con `incluirMargen`.
   *
   * `auditor-seguridad` lo dijo sin rodeos: publicar el margen **es** publicar el neto, porque
   * `neto = venta − margen`. La barrera que debía impedirlo —`TarifaPublica`— estaba declarada
   * y **no la importaba nadie**, que es peor que no tenerla: hace creer que hay un muro donde
   * no lo hay.
   *
   * Por eso la clave se **omite entera** en vez de venir en `null`: una pantalla de cara al
   * viajero que consuma esto no recibe el dato ni puede despejarlo. Y el valor por defecto es el
   * seguro, que es la única forma de que un descuido futuro falle hacia el lado bueno.
   */
  margen: Dinero.nullable().optional(),
  margenPorcentaje: z.number().nullable().optional(),
  /**
   * **Describe, no prescribe.** Se llamaba `recomendada` y `experto-turismo` tuvo razón en
   * señalarlo: la opción más barata es, casi por definición, la de PEOR margen —mismo neto,
   * menor venta—, y este producto paga comisión al asesor sobre margen. Poner «recomendada»
   * sobre la línea que menos le deja a la agencia es fingir un juicio comercial que el sistema
   * no tiene. El nombre dice ahora lo que de verdad calcula.
   */
  masBarata: z.boolean(),
  /** Cómo pintar el precio unitario según `promo_vencida`. El total y la venta no cambian. */
  presentacion: PresentacionDePrecio.optional(),
});
export type OpcionDePrecio = z.infer<typeof OpcionDePrecio>;

/** Un cargo que se paga en destino y no suma al total de la cotización. */
export const CargoEnDestino = z.object({
  concepto: z.string().min(1).max(120),
  /** `null` = existe pero el monto no se conoce. */
  monto: Dinero.nullable(),
  unidad: UnidadDeCobro,
  nota: z.string().max(300).optional(),
});
export type CargoEnDestino = z.infer<typeof CargoEnDestino>;

export const CotizacionDeSalida = z.object({
  paqueteId: Id,
  paqueteNombre: z.string(),
  destino: z.string(),
  noches: z.number().int().min(0),
  fecha: FechaViaje,

  vigenciaId: Id,
  vigenciaDesde: FechaViaje,
  vigenciaHasta: FechaViaje,
  /** `true` si el precio vino de una fecha publicada; `false` si de una vigencia abierta. */
  deSalidaProgramada: z.boolean(),

  adultos: z.number().int().min(0),
  ninos: z.number().int().min(0),
  infantes: z.number().int().min(0),
  pasajeros: z.number().int().min(1),

  /**
   * **La cotización armada: una línea por tipo de pasajero.** Una cotización real no es UNA
   * tarifa, es una SUMA: dos adultos a precio de adulto más un niño a precio de menor. Antes
   * solo se devolvían tarifas sueltas y ese número no existía en ninguna respuesta.
   */
  lineas: z.array(OpcionDePrecio),
  /** El número que el asesor escribe en WhatsApp. Es la suma de `lineas`. */
  total: Dinero,

  /**
   * Tarifas de grupo que podrían **reemplazar** al armado: promo de pareja, precio de grupo.
   * No se aplican solas porque llevan condiciones que el sistema no conoce —cupo del mayorista,
   * «no acumulable»—, y prometer un precio que luego no se puede honrar cuesta un cliente.
   *
   * Ordenadas por total, de menor a mayor: en un celular se lee la primera línea.
   */
  alternativas: z.array(OpcionDePrecio),

  /**
   * Lo que NO aplica, **con su motivo**. Misma filosofía que el desempate de vigencias: no se
   * elige en silencio.
   *
   * Si una promo de pareja desaparece sin explicación para un grupo de tres, el asesor la aplica
   * igual con la calculadora del celular —«dos en promo y uno suelto», que es lo que hace una
   * agencia de verdad— y el informe de margen deja de cuadrar para siempre.
   */
  noAplicables: z.array(
    z.object({ tarifaId: Id, nombre: z.string(), motivo: z.string().max(200) }),
  ),

  /** Tarifas aditivas —suplemento de sencilla y similares—. **No se suman solas.** */
  suplementos: z.array(OpcionDePrecio),

  /**
   * Eje 3 de ADR-0009: **`true` solo si las tarifas aplicables lo piden.** La pantalla pregunta
   * la composición de pasajeros cuando esto viene en `true`, y no cuando no. Se deriva del dato,
   * no de un interruptor que pueda contradecir al tarifario.
   */
  pideComposicion: z.boolean(),

  /** La opción de salida con la que se cotizó; `null` si el producto no tiene opciones. */
  opcionDeSalida: z.object({ id: Id, etiqueta: z.string() }).nullable().optional(),
  /**
   * Lo que el viajero paga en destino (tasa portuaria, impuesto de muelle). **Se muestra aparte y
   * NUNCA entra en `total`.** Cada cargo trae su monto y su unidad de cobro.
   */
  cargosEnDestino: z.array(CargoEnDestino).optional(),
});
export type CotizacionDeSalida = z.infer<typeof CotizacionDeSalida>;

// =============================================================================
// Gestión por id desde la pantalla (ADR-0017 §4.1)
// =============================================================================

/**
 * Edición parcial de una vigencia (`PATCH /api/v1/catalogo/vigencias/:id`). Mover la ventana pasa
 * por el mismo validador que el alta: si el resultado empata con otra vigencia del paquete, es 409.
 * `.strict()`: un `tenantId` o un `paqueteId` en el cuerpo es un 400 (una vigencia no cambia de paquete).
 */
export const EditarVigencia = z
  .object({
    desde: FechaViaje,
    hasta: FechaViaje,
    publicada: z.boolean(),
    cupoTotal: z.number().int().min(0).max(1000).nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'no hay nada que cambiar' })
  .refine((v) => v.desde === undefined || v.hasta === undefined || v.desde <= v.hasta, {
    message: 'la fecha de inicio no puede ser posterior a la de fin',
    path: ['hasta'],
  });
export type EditarVigencia = z.infer<typeof EditarVigencia>;

/**
 * Edición parcial de una tarifa (`PATCH /api/v1/catalogo/tarifas/:id`). El nombre es la clave de la
 * tarifa dentro de su vigencia y no se edita aquí. Enviar `neto` exige `cotizacion.ver_neto_y_margen`.
 */
export const EditarTarifa = z
  .object({
    unidad: UnidadDeCobro,
    cubrePasajeros: z.number().int().min(1).max(200),
    neto: Dinero.nullable(),
    venta: Dinero,
    mayoristaId: Id.nullable(),
    aditiva: z.boolean(),
    condicion: CondicionDeTarifa,
  })
  .partial()
  .strict()
  .refine((t) => Object.keys(t).length > 0, { message: 'no hay nada que cambiar' });
export type EditarTarifa = z.infer<typeof EditarTarifa>;

/** Una tarifa como la ve quien administra el catálogo. Sin `cotizacion.ver_neto_y_margen` no lleva `neto`. */
export const TarifaDeGestion = z.object({
  id: Id,
  nombre: z.string(),
  unidad: UnidadDeCobro,
  cubrePasajeros: z.number().int().min(1),
  /** La clave se omite entera sin el permiso: ni siquiera viaja un `null` que delate el dato. */
  neto: Dinero.nullable().optional(),
  venta: Dinero,
  lista: Dinero.nullable(),
  promoHasta: FechaViaje.nullable(),
  mayoristaId: Id.nullable(),
  opcionDeSalida: z.string().nullable(),
  aditiva: z.boolean(),
  condicion: CondicionDeTarifa,
});
export type TarifaDeGestion = z.infer<typeof TarifaDeGestion>;

export const VigenciaDeGestion = z.object({
  id: Id,
  paqueteId: Id,
  desde: FechaViaje,
  hasta: FechaViaje,
  publicada: z.boolean(),
  cupoTotal: z.number().int().nullable(),
  tarifas: z.array(TarifaDeGestion),
});
export type VigenciaDeGestion = z.infer<typeof VigenciaDeGestion>;

/** Quién originó un cambio de precio (ADR-0017 §8). Con IA, el actor es quien confirmó. */
export const OrigenDeCambio = z.enum(['PANTALLA', 'ARCHIVO', 'API', 'IA']);
export type OrigenDeCambio = z.infer<typeof OrigenDeCambio>;

/**
 * Una entrada del historial de precios de una tarifa (T-047). Se lee de `registros_auditoria`.
 * `usuarioId` es solo el id, sin datos personales. En las entradas de `neto`, sin
 * `cotizacion.ver_neto_y_margen`, `antes` y `despues` se omiten (la clave no viaja).
 */
export const CambioDePrecio = z.object({
  id: z.string().regex(/^\d+$/),
  instante: Instante,
  usuarioId: Id.nullable(),
  accion: z.string(),
  campo: z.enum(['venta', 'neto', 'lista', 'promo_hasta']),
  antes: z.string().nullable().optional(),
  despues: z.string().nullable().optional(),
  moneda: z.enum(['COP', 'USD', 'EUR', 'MXN']).nullable(),
  origen: OrigenDeCambio.nullable(),
});
export type CambioDePrecio = z.infer<typeof CambioDePrecio>;

export const ConsultaHistorialDePrecios = z
  .object({
    limite: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z
      .string()
      .regex(/^\d{1,18}$/)
      .optional(),
  })
  .strict();
export type ConsultaHistorialDePrecios = z.infer<typeof ConsultaHistorialDePrecios>;

export const HistorialDePrecios = z.object({
  datos: z.array(CambioDePrecio),
  /** Pasar como `cursor` para la página siguiente; `null` si no hay más. */
  siguienteCursor: z.string().nullable(),
});
export type HistorialDePrecios = z.infer<typeof HistorialDePrecios>;
