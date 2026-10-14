/**
 * La política de precio de una agencia — cómo se forma la venta a partir del neto del mayorista.
 *
 * **Qué la justifica hoy.** ADR-0006 ya puso el *markup* en el nivel 1 de configurabilidad, por
 * tenant, en v1. Así que esto no depende de que se firme el ADR-0009: la agencia necesita decir
 * cuál es su margen cuelgue la tarifa de donde cuelgue.
 *
 * **Lo que deliberadamente NO está aquí.** ADR-0009 declara tres ejes paramétricos. Este archivo
 * solo lleva el segundo. El primero —`modoDeCatalogo`, si la agencia publica salidas con fecha o
 * vigencias abiertas— **espera la firma del ADR**, porque sin ella no hay `Vigencia` a la que
 * referirse. El tercero —qué pregunta el cotizador— nunca será un campo: **se deriva del dato**,
 * y una bandera que puede contradecir al tarifario es un defecto esperando su turno.
 *
 * **Dónde viven los valores por defecto:** en `POLITICA_POR_DEFECTO`, en `@viajapro/domain`, y en
 * ningún otro sitio. Estos esquemas validan la forma y no repiten el «20», para que no haya dos
 * fuentes del mismo número separándose con el tiempo.
 *
 * Ver ADR-0009 §2 (eje 2) y `packages/domain/src/precio-de-venta.ts`.
 */

import { z } from 'zod';
import { Instante } from './comunes.js';

/**
 * Sobre qué se calcula el porcentaje. **Las dos lecturas de «margen del 20 %» dan precios
 * distintos** —$1.200.000 y $1.250.000 sobre el mismo neto de un millón—, así que el dato viaja
 * explícito y nunca se infiere.
 */
export const BaseDelMargen = z.enum(['SOBRE_EL_NETO', 'SOBRE_LA_VENTA']);
export type BaseDelMargen = z.infer<typeof BaseDelMargen>;

/** Quién manda cuando el mayorista sube su neto: el porcentaje o el número de la hoja. */
export const OrigenDeLaVenta = z.enum(['DERIVADA_DEL_NETO', 'FIJADA_EN_EL_TARIFARIO']);
export type OrigenDeLaVenta = z.infer<typeof OrigenDeLaVenta>;

export const PoliticaDePrecio = z
  .object({
    /** Puntos porcentuales. Admite decimales: 12,5 es válido. */
    porcentaje: z.number().min(0).max(500),
    base: BaseDelMargen,
    origenDeLaVenta: OrigenDeLaVenta,
    /**
     * Paso de redondeo de la **venta**, en unidades mínimas de la moneda. 0 es no redondear.
     * Nunca se redondea el neto: es lo que cobra el mayorista.
     */
    redondeoVenta: z.number().int().min(0).max(1_000_000),
    /** Si una tarifa suelta puede traer su propio porcentaje y apartarse de la política. */
    admiteMargenPorTarifa: z.boolean(),
    actualizadaEn: Instante,
  })
  .refine((p) => p.base !== 'SOBRE_LA_VENTA' || p.porcentaje < 100, {
    message: 'un margen sobre la venta del 100 % o más no tiene precio de venta finito',
    path: ['porcentaje'],
  });
export type PoliticaDePrecio = z.infer<typeof PoliticaDePrecio>;

/**
 * Lo que la agencia puede cambiar desde la pantalla de configuración.
 *
 * Todo opcional porque se envía solo lo que se toca; `actualizadaEn` lo pone el servidor y por eso
 * no está. Un cambio aquí **no altera ninguna cotización ya enviada**: una cotización congela sus
 * números, y ese invariante no es configurable (ADR-0009 §3).
 */
export const ActualizarPoliticaDePrecio = PoliticaDePrecio.innerType()
  .omit({ actualizadaEn: true })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'no se envió ningún cambio' })
  .refine((p) => p.base !== 'SOBRE_LA_VENTA' || p.porcentaje === undefined || p.porcentaje < 100, {
    message: 'un margen sobre la venta del 100 % o más no tiene precio de venta finito',
    path: ['porcentaje'],
  });
export type ActualizarPoliticaDePrecio = z.infer<typeof ActualizarPoliticaDePrecio>;
