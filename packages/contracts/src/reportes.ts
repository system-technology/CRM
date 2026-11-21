/**
 * Reportes: el resumen de un periodo, agregado en el servidor.
 *
 * `GET /api/v1/reportes/resumen?desde=<instante>&hasta=<instante>[&asesorId=<id>|yo]`
 *
 * **El alcance lo impone el servidor (ADR-0035).** Sin `reportes.ver_agencia` la respuesta es
 * `alcance: 'PROPIO'` y sus filas son las del usuario de la sesión; el parámetro `asesorId` no
 * amplía nada y, si nombra a otro asesor, la respuesta es 403. Con el permiso, `alcance:
 * 'AGENCIA'` y `asesorId` filtra por un asesor o es `null` (toda la agencia).
 *
 * **El rango son instantes, no días.** `desde` inclusivo y `hasta` exclusivo, en UTC (R9). La web
 * convierte «este mes» a esos dos instantes con la zona horaria de la agencia; el servidor no
 * interpreta husos al contar. Máximo 366 días: un reporte no es una exportación.
 *
 * **Las monedas no se mezclan (R8).** `ventasPorMoneda` trae una fila por moneda, con enteros en
 * la unidad mínima (en COP es el peso). Nada suma COP con USD.
 *
 * **Neto y margen (ADR-0011).** Las claves `neto`, `margen`, `margenPorcentaje` y
 * `cotizacionesSinNeto` de cada fila de `ventasPorMoneda` EXISTEN solo si el usuario tiene
 * `cotizacion.ver_neto_y_margen`. Sin el permiso no vienen: ni en cero ni en `null`. Con el
 * permiso, `neto` y `margen` son `null` cuando ninguna cotización de esa moneda tiene neto
 * conocido (desconocido no es cero).
 *
 * **Cohortes.** Cada cifra se ancla al hecho que la define, y la tasa usa la misma cohorte que su
 * numerador y su denominador:
 *   · cotizaciones `creadas`: `creadoEn` en el rango; `enviadas`: `enviadaEn` en el rango;
 *   · `aceptadas`: de las enviadas en el rango, las que hoy están ACEPTADA. `tasaAceptacion` es
 *     aceptadas / enviadas (la aceptación no guarda su propio instante);
 *   · ventas: la versión enviada de las cotizaciones cuyo CAMBIO A ACEPTADA (historial de estados)
 *     cae en el rango: es el instante de la venta, no el del envío. Las aceptadas anteriores al
 *     historial no tienen ese instante y no entran en `ventasPorMoneda`: se cuentan aparte en
 *     `cotizaciones.aceptadasSinFecha` (las enviadas en el rango);
 *   · oportunidades: las CREADAS en el rango, clasificadas por su etapa de hoy.
 *     `tasaConversion` es ganadas / (ganadas + perdidas), `null` si ninguna se cerró.
 *   · respuesta: las conversaciones CREADAS en el rango (excluidas las que abrió el asesor, sin
 *     mensaje entrante previo). Numerador, denominador, mediana y p90 salen de ese mismo grupo:
 *     `conversacionesRespondidas` + `sinResponder` = `conversacionesNuevas`, y el tiempo se mide
 *     desde el primer mensaje entrante del viajero hasta la primera respuesta.
 * Las tasas y promedios son `null` (no 0) cuando no hay base para calcularlos.
 */

import { z } from 'zod';
import { Dinero, Id, Instante } from './comunes.js';

const DIA_MS = 24 * 60 * 60 * 1000;
export const MAXIMO_DIAS_DE_REPORTE = 366;

/**
 * `yo` es el atajo del propio usuario de la sesión: la web no necesita saber su id para pedir
 * «lo mío». Un `asesorId` ajeno sin `reportes.ver_agencia` responde 403, nunca un recorte en
 * silencio (ADR-0035 §4).
 */
export const AsesorDeReporte = z.union([Id, z.literal('yo')]);
export type AsesorDeReporte = z.infer<typeof AsesorDeReporte>;

export const ConsultarResumenDeReportes = z
  .object({ desde: Instante, hasta: Instante, asesorId: AsesorDeReporte.optional() })
  .strict()
  .superRefine((q, ctx) => {
    const d = Date.parse(q.desde);
    const h = Date.parse(q.hasta);
    if (!(d < h)) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: '`hasta` debe ser posterior a `desde`',
      });
    } else if (h - d > MAXIMO_DIAS_DE_REPORTE * DIA_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: `el rango no puede superar ${MAXIMO_DIAS_DE_REPORTE} días`,
      });
    }
  });
export type ConsultarResumenDeReportes = z.infer<typeof ConsultarResumenDeReportes>;

export const ResumenDeCotizaciones = z.object({
  creadas: z.number().int().min(0),
  enviadas: z.number().int().min(0),
  aceptadas: z.number().int().min(0),
  /**
   * Aceptadas, enviadas en el rango, SIN fila de cambio a ACEPTADA (anteriores al historial de
   * estados): no tienen fecha de venta y por eso no suman en `ventasPorMoneda`. Opcional: una
   * API anterior no lo envía.
   */
  aceptadasSinFecha: z.number().int().min(0).optional(),
  /** Porcentaje con un decimal; `null` si no se envió ninguna. */
  tasaAceptacion: z.number().min(0).max(100).nullable(),
});
export type ResumenDeCotizaciones = z.infer<typeof ResumenDeCotizaciones>;

export const VentasDeUnaMoneda = z.object({
  moneda: Dinero.shape.moneda,
  cotizacionesAceptadas: z.number().int().min(1),
  ventas: Dinero,
  // Solo con `cotizacion.ver_neto_y_margen`: sin el permiso las claves no existen.
  neto: Dinero.nullable().optional(),
  margen: Dinero.nullable().optional(),
  margenPorcentaje: z.number().nullable().optional(),
  cotizacionesSinNeto: z.number().int().min(0).optional(),
});
export type VentasDeUnaMoneda = z.infer<typeof VentasDeUnaMoneda>;

export const OportunidadesDeUnaEtapa = z.object({
  etapaId: Id,
  nombre: z.string(),
  orden: z.number().int(),
  esGanada: z.boolean(),
  esPerdida: z.boolean(),
  cantidad: z.number().int().min(0),
});
export type OportunidadesDeUnaEtapa = z.infer<typeof OportunidadesDeUnaEtapa>;

export const ResumenDeOportunidades = z.object({
  creadas: z.number().int().min(0),
  ganadas: z.number().int().min(0),
  perdidas: z.number().int().min(0),
  abiertas: z.number().int().min(0),
  tasaConversion: z.number().min(0).max(100).nullable(),
  /** Una entrada por etapa de la agencia, también las vacías, en el orden del pipeline. */
  porEtapa: z.array(OportunidadesDeUnaEtapa),
});
export type ResumenDeOportunidades = z.infer<typeof ResumenDeOportunidades>;

export const ResumenDeRespuesta = z.object({
  conversacionesNuevas: z.number().int().min(0),
  conversacionesRespondidas: z.number().int().min(0),
  /** Minutos con un decimal; `null` si ninguna conversación tiene una respuesta medible. */
  promedioMinutos: z.number().min(0).nullable(),
  medianaMinutos: z.number().min(0).nullable(),
  /** Percentil 90 del tiempo de primera respuesta del mismo grupo. Opcional: API anterior. */
  p90Minutos: z.number().min(0).nullable().optional(),
  /** Del grupo de `conversacionesNuevas`, las que aún no tienen respuesta. Opcional. */
  sinResponder: z.number().int().min(0).optional(),
  /** respondidas / nuevas, en porcentaje con un decimal; `null` sin conversaciones. Opcional. */
  tasaRespuesta: z.number().min(0).max(100).nullable().optional(),
});
export type ResumenDeRespuesta = z.infer<typeof ResumenDeRespuesta>;

/** Las cifras, iguales en los dos alcances. Lo que cambia es QUÉ FILAS las componen. */
const CIFRAS_DEL_RESUMEN = {
  periodo: z.object({ desde: Instante, hasta: Instante }),
  cotizaciones: ResumenDeCotizaciones,
  ventasPorMoneda: z.array(VentasDeUnaMoneda),
  oportunidades: ResumenDeOportunidades,
  respuesta: ResumenDeRespuesta,
} as const;

export const AlcanceDelResumen = z.enum(['PROPIO', 'AGENCIA']);
export type AlcanceDelResumen = z.infer<typeof AlcanceDelResumen>;

/**
 * Lo que ve quien NO tiene `reportes.ver_agencia`: solo lo suyo, y `asesorId` es SIEMPRE el
 * usuario de la sesión (el servidor no acepta otro, ADR-0035 §1).
 *
 * `strict()` no es decoración: las métricas que son solo de administración (embudo por cohorte,
 * comparación entre asesores, cobros de la agencia) irán únicamente en `ResumenDeAgencia`, y aquí
 * una clave de más no se recorta en silencio: falla la validación de salida del servidor.
 */
export const ResumenPropio = z
  .object({ ...CIFRAS_DEL_RESUMEN, alcance: z.literal('PROPIO'), asesorId: Id })
  .strict();
export type ResumenPropio = z.infer<typeof ResumenPropio>;

/** Lo que ve quien SÍ lo tiene. `asesorId` es el filtro aplicado, o `null` si es toda la agencia. */
export const ResumenDeAgencia = z
  .object({ ...CIFRAS_DEL_RESUMEN, alcance: z.literal('AGENCIA'), asesorId: Id.nullable() })
  .strict();
export type ResumenDeAgencia = z.infer<typeof ResumenDeAgencia>;

/**
 * **El contrato del endpoint** (ADR-0035 §4): una unión discriminada por `alcance`. El servidor
 * valida su propia salida con ella, así que una clave de agencia en una respuesta propia falla en
 * la prueba y no en producción (§9.3). La respuesta dice el `alcance` y el `asesorId` efectivos
 * para que la web titule con la verdad y no deduzca nada de los permisos.
 */
export const ResumenDeReportes = z.discriminatedUnion('alcance', [ResumenPropio, ResumenDeAgencia]);
export type ResumenDeReportes = z.infer<typeof ResumenDeReportes>;

/** Nombre anterior de la unión (T-342); se conserva como alias de exportación, sin segundo esquema. */
export const ResumenDeReportesPorAlcance = ResumenDeReportes;
export type ResumenDeReportesPorAlcance = ResumenDeReportes;
