/**
 * Contratos de las plantillas de WhatsApp (HSM).
 *
 * **Para qué existen.** Pasadas 24 horas desde el último mensaje del viajero, Meta no deja
 * enviar texto libre. Lo único que sale es una plantilla aprobada previamente por ellos. Por eso
 * una plantilla no es una comodidad para escribir rápido: es **la única puerta** para reabrir
 * una conversación que se enfrió, y en una agencia de viajes eso es casi siempre dinero —el
 * viajero que preguntó el viernes y vuelve el lunes, el anticipo que vence, el time limit del
 * mayorista.
 *
 * **Aprobadas por Meta, no por nosotros.** El texto se registra, Meta lo revisa y tarda. Una
 * plantilla rechazada o pausada no se puede enviar, y el asesor tiene que verlo **antes** de
 * elegirla, no después de que falle. Por eso `estado` viaja en el contrato y no se filtra en
 * silencio: una lista que esconde las rechazadas no explica por qué falta la que se usaba ayer.
 *
 * **Cuestan dinero desde el 2026-10-01.** Meta cobra también los mensajes de servicio. El coste
 * exacto en pesos colombianos está pendiente de bajar del tarifario oficial —tarea 2b de
 * `ESTADO.md`— pero el orden de magnitud ya cambió, así que la interfaz no debe invitar a
 * mandar plantillas a la ligera.
 *
 * Verificado en `docs/04-integraciones/01-whatsapp-cloud-api.md`.
 */

import { z } from 'zod';
import { Id, Instante } from './comunes.js';

/**
 * La categoría que Meta asigna, y de la que depende la tarifa.
 *
 * `UTILIDAD` es seguimiento de algo que el viajero ya pidió —su reserva, su pago, su vuelo—.
 * `MARKETING` es todo lo demás, cuesta más y exige consentimiento promocional.
 * `AUTENTICACION` son códigos de un solo uso; aquí no se usa, pero existe en la API de Meta y
 * omitirla haría que una plantilla real no validara.
 */
export const CategoriaPlantilla = z.enum(['UTILIDAD', 'MARKETING', 'AUTENTICACION']);
export type CategoriaPlantilla = z.infer<typeof CategoriaPlantilla>;

/**
 * Estado de revisión en Meta.
 *
 * `PAUSADA` es el que más sorprende: Meta pausa sola una plantilla cuando los destinatarios la
 * marcan como spam, sin avisar y sin que nadie la haya tocado. Una que funcionaba el martes
 * puede no funcionar el jueves.
 */
export const EstadoPlantilla = z.enum([
  'APROBADA',
  'PENDIENTE',
  'RECHAZADA',
  'PAUSADA',
  'DESHABILITADA',
]);
export type EstadoPlantilla = z.infer<typeof EstadoPlantilla>;

/**
 * Un hueco del texto: `{{1}}`, `{{2}}`…
 *
 * Meta los numera desde 1 y exige que estén **todos** rellenos y en orden. Mandar `{{2}}` sin
 * `{{1}}` no es un texto con un hueco vacío: es un envío rechazado.
 */
export const VariablePlantilla = z.object({
  /** Empieza en 1, como en el texto de Meta. */
  indice: z.number().int().min(1).max(50),
  /** Qué significa este hueco, para que el asesor sepa qué escribir: «nombre del viajero». */
  descripcion: z.string().max(120).nullable(),
  /** El ejemplo que se registró ante Meta. Sirve de marcador de posición en el formulario. */
  ejemplo: z.string().max(200).nullable(),
});
export type VariablePlantilla = z.infer<typeof VariablePlantilla>;

/** Un botón de la plantilla. Los de respuesta rápida son los que reabren la conversación. */
export const BotonPlantilla = z.object({
  tipo: z.enum(['RESPUESTA_RAPIDA', 'URL', 'TELEFONO']),
  texto: z.string().min(1).max(25),
  /** Solo en `URL` y `TELEFONO`. */
  valor: z.string().max(2000).nullable(),
});
export type BotonPlantilla = z.infer<typeof BotonPlantilla>;

export const PlantillaWhatsApp = z.object({
  id: Id,
  /** El nombre registrado en Meta: minúsculas y guiones bajos. Es su identificador allí. */
  nombre: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'Meta solo admite minúsculas, dígitos y guion bajo'),
  /** Código de idioma de Meta: `es`, `es_CO`, `en_US`. La misma plantilla existe en varios. */
  idioma: z.string().min(2).max(10),
  categoria: CategoriaPlantilla,
  estado: EstadoPlantilla,
  /** Motivo cuando `estado` es `RECHAZADA` o `PAUSADA`, en lenguaje de persona. */
  motivoEstado: z.string().max(500).nullable(),
  encabezado: z.string().max(60).nullable(),
  cuerpo: z.string().min(1).max(1024),
  pie: z.string().max(60).nullable(),
  botones: z.array(BotonPlantilla).max(10),
  variables: z.array(VariablePlantilla).max(50),
  actualizadaEn: Instante,
});
export type PlantillaWhatsApp = z.infer<typeof PlantillaWhatsApp>;

/**
 * Enviar una plantilla.
 *
 * Mismo trato que `EnviarTexto`: clave de idempotencia del cliente, porque un doble clic o un
 * reintento de red mandarían dos veces un mensaje que **se cobra dos veces** y que el viajero
 * recibe dos veces (R5).
 *
 * `valores` va por índice, igual que Meta: la primera posición es `{{1}}`.
 */
export const EnviarPlantilla = z
  .object({
    conversacionId: Id,
    plantillaId: Id,
    idioma: z.string().min(2).max(10),
    valores: z.array(z.string().max(1000)).max(50),
    claveIdempotencia: z.string().uuid(),
  })
  .superRefine((envio, ctx) => {
    // Un hueco en blanco produce «Hola , su reserva» y Meta lo rechaza. Es el error más
    // frecuente de esta integración y se atrapa aquí, no en el servidor de Meta.
    envio.valores.forEach((valor, i) => {
      if (!valor.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valores', i],
          message: `Falta el valor de {{${i + 1}}}. Meta rechaza una plantilla con huecos vacíos.`,
        });
      }
    });
  });
export type EnviarPlantilla = z.infer<typeof EnviarPlantilla>;

/**
 * Lo que la bandeja pide cuando la ventana se cierra.
 *
 * Trae **todas** las plantillas, no solo las aprobadas, y por eso cada una lleva su `estado`.
 * Filtrar aquí dejaría al asesor preguntándose dónde está la que usó la semana pasada; la
 * interfaz las muestra deshabilitadas con el motivo al lado, que es una respuesta.
 */
export const PlantillasDisponibles = z.object({
  plantillas: z.array(PlantillaWhatsApp),
  /** Cuántas se pueden enviar de verdad. Si es 0, el asesor no puede reabrir nada: es un aviso. */
  aprobadas: z.number().int().min(0),
});
export type PlantillasDisponibles = z.infer<typeof PlantillasDisponibles>;
