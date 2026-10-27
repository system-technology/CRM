/**
 * Formatos de viaje de la agencia (ADR-0017 §4.2): el tipo de producto con su plantilla de ENTRADA.
 *
 * Tabla por agencia (R12), no enum. La plantilla solo decide qué se pide y qué viene por defecto:
 * ninguna ruta de cálculo ramifica sobre el formato (ADR-0009).
 */

import { z } from 'zod';
import { Id, Instante } from './comunes.js';

/** Claves de columna estándar que una plantilla puede marcar como obligatorias. */
export const CAMPOS_ESTANDAR_DE_PLANTILLA = [
  'codigo',
  'destino',
  'dias',
  'noches',
  'plan_alimentacion',
  'inclusiones',
  'exclusiones',
  'acomodacion',
  'tipo_pasajero',
  'precio_neto',
  'precio_lista',
  'promo_hasta',
  'mayorista',
  'opcion_salida',
] as const;

/**
 * Qué se pide al cargar un producto de este formato. `.strict()`: una clave desconocida es un 400,
 * no se guarda basura en un `jsonb` que solo Zod protege.
 */
export const PlantillaDeFormato = z
  .object({
    /** Campos estándar que la hoja o el formulario exigen para este formato. */
    obligatorios: z.array(z.enum(CAMPOS_ESTANDAR_DE_PLANTILLA)).max(20).default([]),
    /** Claves de campos personalizados de `PAQUETE` que aplican a este formato. */
    camposPersonalizados: z
      .array(
        z
          .string()
          .max(64)
          .regex(/^[a-z][a-z0-9_]*$/),
      )
      .max(50)
      .default([]),
    valoresPorDefecto: z
      .object({
        dias: z.number().int().min(1).max(365).optional(),
        noches: z.number().int().min(0).max(364).optional(),
        unidad: z.enum(['POR_PERSONA', 'POR_GRUPO']).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type PlantillaDeFormato = z.infer<typeof PlantillaDeFormato>;

export const FormatoDeViaje = z.object({
  id: Id,
  nombre: z.string().min(1).max(80),
  orden: z.number().int(),
  activo: z.boolean(),
  plantilla: PlantillaDeFormato,
  creadoEn: Instante,
});
export type FormatoDeViaje = z.infer<typeof FormatoDeViaje>;

export const CrearFormatoDeViaje = z
  .object({
    nombre: z.string().min(1).max(80),
    orden: z.number().int().min(0).max(1000).optional(),
    plantilla: PlantillaDeFormato.optional(),
  })
  .strict();
export type CrearFormatoDeViaje = z.infer<typeof CrearFormatoDeViaje>;

export const EditarFormatoDeViaje = z
  .object({
    nombre: z.string().min(1).max(80).optional(),
    orden: z.number().int().min(0).max(1000).optional(),
    activo: z.boolean().optional(),
    plantilla: PlantillaDeFormato.optional(),
  })
  .strict()
  .refine((f) => Object.keys(f).length > 0, { message: 'no hay nada que cambiar' });
export type EditarFormatoDeViaje = z.infer<typeof EditarFormatoDeViaje>;
