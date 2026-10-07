/**
 * Piezas compartidas por todos los contratos.
 *
 * Regla R3: esto es la FUENTE DE VERDAD. La API valida con estos esquemas y la web deriva sus
 * tipos de aquí. Nadie redefine un tipo que viva en este paquete.
 */

import { z } from 'zod';

/** Identificador de entidad. UUID v7 en la base, pero aquí basta con validar la forma. */
export const Id = z.string().uuid();
export type Id = z.infer<typeof Id>;

/**
 * Dinero tal como viaja por la API.
 *
 * `unidades` es un ENTERO en la unidad mínima de la moneda, serializado como cadena porque
 * JSON no tiene enteros de 64 bits: un importe grande en pesos colombianos supera el entero
 * seguro de JavaScript y se corrompería en silencio al deserializar. Ver R8 y
 * `packages/domain/money.ts`.
 */
export const Dinero = z.object({
  unidades: z.string().regex(/^-?\d+$/, 'debe ser un entero en texto'),
  moneda: z.enum(['COP', 'USD', 'EUR', 'MXN']),
});
export type Dinero = z.infer<typeof Dinero>;

/** Teléfono en formato E.164. Es la llave natural del canal de WhatsApp. */
export const TelefonoE164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'debe estar en formato E.164, por ejemplo +573001234567');
export type TelefonoE164 = z.infer<typeof TelefonoE164>;

/** Fecha de viaje, sin hora. El 24 de diciembre es el 24 en cualquier huso. R9. */
export const FechaViaje = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'debe ser AAAA-MM-DD');
export type FechaViaje = z.infer<typeof FechaViaje>;

/** Instante, siempre en UTC. R9. */
export const Instante = z.string().datetime({ offset: true });
export type Instante = z.infer<typeof Instante>;

export const Acomodacion = z.enum(['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE']);
export type Acomodacion = z.infer<typeof Acomodacion>;

export const TipoPasajero = z.enum(['ADT', 'CHD', 'INF']);
export type TipoPasajero = z.infer<typeof TipoPasajero>;

export const PlanAlimentacion = z.enum([
  'TODO_INCLUIDO',
  'DESAYUNO',
  'MEDIA_PENSION',
  'PENSION_COMPLETA',
  'SIN_ALIMENTACION',
]);
export type PlanAlimentacion = z.infer<typeof PlanAlimentacion>;

/**
 * Composición de pasajeros de una consulta o cotización.
 *
 * Las invariantes del dominio —al menos un adulto, no más infantes que adultos— se validan
 * aquí también y no solo en `packages/domain`. No es duplicación ociosa: rechazar en el borde
 * da un error 422 legible, mientras que dejarlo llegar al dominio produce una excepción que
 * hay que traducir.
 */
export const ComposicionPasajeros = z
  .object({
    adultos: z.number().int().min(1, 'se necesita al menos un adulto'),
    ninos: z.number().int().min(0).default(0),
    infantes: z.number().int().min(0).default(0),
  })
  .refine((c) => c.infantes <= c.adultos, {
    message: 'un infante viaja en brazos de un adulto: no puede haber más infantes que adultos',
    path: ['infantes'],
  });
export type ComposicionPasajeros = z.infer<typeof ComposicionPasajeros>;

/**
 * Paginación por cursor, no por desplazamiento.
 *
 * Con desplazamiento, insertar una fila mientras alguien pagina le hace ver un elemento dos
 * veces o saltárselo. En una bandeja donde entran mensajes constantemente, eso pasa siempre.
 */
export const ParametrosPagina = z.object({
  cursor: z.string().optional(),
  limite: z.number().int().min(1).max(100).default(25),
});
export type ParametrosPagina = z.infer<typeof ParametrosPagina>;

export function pagina<T extends z.ZodTypeAny>(elemento: T) {
  return z.object({
    datos: z.array(elemento),
    pageInfo: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  });
}

/** Forma uniforme de error. El `code` es contrato; el `message` puede cambiar. */
export const ErrorApi = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorApi = z.infer<typeof ErrorApi>;
