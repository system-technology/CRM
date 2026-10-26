/**
 * `PropuestaDeCatalogo` — el contrato único con el que cualquier canal (pantalla, archivo, API
 * pública, IA) pide cambiar el catálogo. ADR-0017 §2.
 *
 * Los cuatro canales son adaptadores de entrada que producen **este** objeto; un solo núcleo
 * (`validarYPlanificar`, en `apps/api/src/modules/quoting/domain/`) lo valida y calcula el plan.
 *
 * Decisiones que este archivo hace cumplir:
 *
 * - **Sin `tenantId` ni identificadores internos.** Una propuesta se resuelve por clave natural
 *   dentro del tenant de quien la presenta (sesión o clave de API). Todos los objetos son
 *   `.strict()`: un `tenantId` en el cuerpo es un campo desconocido y se rechaza, no se ignora.
 * - **Todo valor está tipado**: dinero en unidades mínimas + ISO-4217 (R8; en COP la unidad mínima
 *   es el peso), fechas `AAAA-MM-DD`, horas locales `HH:MM`. Convertir texto a tipos es trabajo del
 *   adaptador, no del núcleo.
 * - **La confianza es un número `0..1`**, no un enum. Solo ordena la revisión; nunca cambia lo que
 *   se aplica.
 */

import { z } from 'zod';
import { CondicionDeTarifa, CONDICION_SIEMPRE, UnidadDeCobro } from './vigencias.js';
import { Dinero, FechaViaje, PlanAlimentacion } from './comunes.js';

/** Tope de productos por propuesta (ADR-0017 §1). */
export const MAXIMO_DE_PRODUCTOS_POR_PROPUESTA = 500;
/** Tope de tarifas por propuesta (ADR-0017 §1). */
export const MAXIMO_DE_TARIFAS_POR_PROPUESTA = 2000;

export const OrigenDePropuesta = z.enum(['PANTALLA', 'ARCHIVO', 'API', 'IA']);
export type OrigenDePropuesta = z.infer<typeof OrigenDePropuesta>;

/** Hora local del punto de encuentro, sin zona: convertirla a UTC la rompería con el huso. */
export const HoraLocal = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'debe ser HH:MM');
export type HoraLocal = z.infer<typeof HoraLocal>;

/**
 * De dónde salió un dato.
 *
 * - `fila` y `columna`: archivo.
 * - `fuente` y `fragmento` (cita literal, ≤ 300 caracteres): IA.
 * - `confianza`: IA, informativa. Un número entre 0 y 1; «alta/media/baja» se deriva en pantalla.
 */
export const Procedencia = z
  .object({
    fila: z.number().int().min(1).optional(),
    columna: z.string().min(1).max(80).optional(),
    fuente: z.string().min(1).max(2000).optional(),
    fragmento: z.string().min(1).max(300).optional(),
    confianza: z.number().min(0).max(1).optional(),
  })
  .strict();
export type Procedencia = z.infer<typeof Procedencia>;

/** La variante de operación que el viajero elige dentro del mismo producto (ADR-0017 §3.1). */
export const OpcionDeSalidaPropuesta = z
  .object({
    etiqueta: z.string().min(1).max(80),
    horaSalida: HoraLocal.optional(),
    horaRegreso: HoraLocal.optional(),
    puntoDeEncuentro: z.string().min(1).max(200).optional(),
  })
  .strict();
export type OpcionDeSalidaPropuesta = z.infer<typeof OpcionDeSalidaPropuesta>;

/** Cargo que el viajero paga en destino (impuesto de muelle, tasa portuaria). */
export const CargoEnDestinoPropuesto = z
  .object({
    concepto: z.string().min(1).max(120),
    /** `null` = existe pero el monto no se conoce. */
    monto: Dinero.nullable(),
    unidad: UnidadDeCobro,
    nota: z.string().max(300).optional(),
  })
  .strict();
export type CargoEnDestinoPropuesto = z.infer<typeof CargoEnDestinoPropuesto>;

export const TarifaPropuesta = z
  .object({
    nombre: z.string().min(1).max(80),
    unidad: UnidadDeCobro,
    /** Siempre 1 en `POR_PERSONA` (lo comprueba el núcleo con su código estable). */
    cubrePasajeros: z.number().int().min(1).max(200).default(1),
    neto: Dinero.nullable().default(null),
    venta: Dinero,
    /** Precio de lista tachado (M2). `venta` es siempre lo que se cobra. */
    lista: Dinero.nullable().optional(),
    promoHasta: FechaViaje.nullable().optional(),
    /** Nombre del mayorista; si no existe se crea y el informe lo dice. No es un id. */
    mayorista: z.string().min(1).max(200).nullable().default(null),
    aditiva: z.boolean().default(false),
    condicion: CondicionDeTarifa.default(CONDICION_SIEMPRE),
    /** Etiqueta de una opción de salida del MISMO producto. */
    opcionDeSalida: z.string().min(1).max(80).optional(),
    procedencia: Procedencia.optional(),
  })
  .strict();
export type TarifaPropuesta = z.infer<typeof TarifaPropuesta>;

export const VigenciaPropuesta = z
  .object({
    desde: FechaViaje,
    hasta: FechaViaje,
    publicada: z.boolean().default(false),
    /** `[]` = «a consultar»: el producto existe y aún no tiene precio. */
    tarifas: z.array(TarifaPropuesta),
  })
  .strict()
  .refine((v) => v.desde <= v.hasta, {
    message: 'la fecha de inicio no puede ser posterior a la de fin',
    path: ['hasta'],
  })
  .refine((v) => !v.publicada || v.desde === v.hasta, {
    message: 'solo se publica una fecha concreta: una vigencia abierta no es una salida',
    path: ['publicada'],
  });
export type VigenciaPropuesta = z.infer<typeof VigenciaPropuesta>;

export const ProductoPropuesto = z
  .object({
    /** Obligatorio si el origen es `API` (refinamiento de `PropuestaDeCatalogo`). */
    codigo: z.string().min(1).max(64).optional(),
    nombre: z.string().min(1).max(200),
    destino: z.string().min(1).max(120),
    dias: z.number().int().min(1).max(365),
    noches: z.number().int().min(0).max(364),
    /** Nombre del formato de viaje del tenant. */
    formato: z.string().min(1).max(80).optional(),
    /** `null` = el producto no tiene alimentación que declarar (pasadía). Requiere M2. */
    planAlimentacion: PlanAlimentacion.nullable().optional(),
    inclusiones: z.array(z.string().max(300)).optional(),
    exclusiones: z.array(z.string().max(300)).optional(),
    opcionesDeSalida: z.array(OpcionDeSalidaPropuesta).max(50).optional(),
    cargosEnDestino: z.array(CargoEnDestinoPropuesto).max(20).optional(),
    camposPersonalizados: z.record(z.unknown()).optional(),
    vigencias: z.array(VigenciaPropuesta).max(MAXIMO_DE_TARIFAS_POR_PROPUESTA),
    procedencia: Procedencia.optional(),
  })
  .strict();
export type ProductoPropuesto = z.infer<typeof ProductoPropuesto>;

export const PropuestaDeCatalogo = z
  .object({
    version: z.literal(1),
    origen: OrigenDePropuesta,
    productos: z.array(ProductoPropuesto).min(1).max(MAXIMO_DE_PRODUCTOS_POR_PROPUESTA),
  })
  .strict()
  .superRefine((propuesta, ctx) => {
    let tarifasTotales = 0;
    propuesta.productos.forEach((producto, p) => {
      if (propuesta.origen === 'API' && producto.codigo === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'con origen API cada producto debe traer su código',
          path: ['productos', p, 'codigo'],
        });
      }
      producto.vigencias.forEach((vigencia, v) => {
        tarifasTotales += vigencia.tarifas.length;
        if (propuesta.origen !== 'IA') return;
        vigencia.tarifas.forEach((tarifa, t) => {
          if (
            tarifa.procedencia?.fuente === undefined ||
            tarifa.procedencia.fragmento === undefined
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'con origen IA cada precio debe citar su fuente y el fragmento literal',
              path: ['productos', p, 'vigencias', v, 'tarifas', t, 'procedencia'],
            });
          }
        });
      });
    });
    if (tarifasTotales > MAXIMO_DE_TARIFAS_POR_PROPUESTA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `una propuesta admite como máximo ${MAXIMO_DE_TARIFAS_POR_PROPUESTA} tarifas`,
        path: ['productos'],
      });
    }
  });
export type PropuestaDeCatalogo = z.infer<typeof PropuestaDeCatalogo>;
/** Lo que un adaptador presenta: los valores por defecto aún sin aplicar. */
export type PropuestaDeCatalogoEntrada = z.input<typeof PropuestaDeCatalogo>;

// =============================================================================
// El informe que devuelve el núcleo
// =============================================================================

export const NivelDeInforme = z.enum(['OK', 'AVISO', 'ERROR']);
export type NivelDeInforme = z.infer<typeof NivelDeInforme>;

export const AccionDePlan = z.enum(['CREAR', 'ACTUALIZAR', 'SIN_CAMBIOS']);
export type AccionDePlan = z.infer<typeof AccionDePlan>;

/** Un elemento del informe: dónde, qué pasó y con qué código estable (el texto puede cambiar). */
export const ElementoDeInforme = z
  .object({
    nivel: NivelDeInforme,
    codigo: z.string().min(1),
    /** Ruta JSON de la propuesta: `productos[0].vigencias[1].tarifas[2]`. */
    ruta: z.string(),
    mensaje: z.string(),
    /** Fila y columna (archivo) o evidencia (IA), si la propuesta la traía. */
    procedencia: Procedencia.optional(),
  })
  .strict();
export type ElementoDeInforme = z.infer<typeof ElementoDeInforme>;

export const InformeDeCatalogo = z
  .object({
    elementos: z.array(ElementoDeInforme),
    resumen: z.object({
      errores: z.number().int().min(0),
      avisos: z.number().int().min(0),
      creados: z.number().int().min(0),
      actualizados: z.number().int().min(0),
      sinCambios: z.number().int().min(0),
    }),
    /** Lo que ya estaba en el catálogo y la propuesta no menciona. El núcleo no borra (D5). */
    noIncluidos: z.array(z.object({ codigo: z.string().nullable(), nombre: z.string() })),
    /** `sha256` de la propuesta canónica + tenant + versión del núcleo. */
    huella: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type InformeDeCatalogo = z.infer<typeof InformeDeCatalogo>;
