/**
 * Reportes: el resumen de un periodo, agregado en el servidor.
 *
 * `GET /api/v1/reportes/resumen?desde=<instante>&hasta=<instante>`
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
 *   · ventas: la versión enviada de esas cotizaciones aceptadas;
 *   · oportunidades: las CREADAS en el rango, clasificadas por su etapa de hoy.
 *     `tasaConversion` es ganadas / (ganadas + perdidas), `null` si ninguna se cerró.
 *   · respuesta: conversaciones cuya primera respuesta cae en el rango, medida desde el primer
 *     mensaje entrante del viajero.
 * Las tasas y promedios son `null` (no 0) cuando no hay base para calcularlos.
 */

import { z } from 'zod';
import { Dinero, Id, Instante } from './comunes.js';

const DIA_MS = 24 * 60 * 60 * 1000;
export const MAXIMO_DIAS_DE_REPORTE = 366;

export const ConsultarResumenDeReportes = z
  .object({ desde: Instante, hasta: Instante })
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
});
export type ResumenDeRespuesta = z.infer<typeof ResumenDeRespuesta>;

export const ResumenDeReportes = z.object({
  periodo: z.object({ desde: Instante, hasta: Instante }),
  cotizaciones: ResumenDeCotizaciones,
  ventasPorMoneda: z.array(VentasDeUnaMoneda),
  oportunidades: ResumenDeOportunidades,
  respuesta: ResumenDeRespuesta,
});
export type ResumenDeReportes = z.infer<typeof ResumenDeReportes>;
