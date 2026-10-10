/**
 * Contratos del contexto `crm`: contactos y oportunidades.
 *
 * **Esta es la costura del pipeline y del panel lateral de la bandeja.** La web los construye
 * contra estos esquemas sin esperar al backend. Si falta un campo, se añade aquí primero
 * (regla R3).
 *
 * Tres conceptos que el sector distingue y nosotros también, porque confundirlos se paga caro:
 *
 *   · **Contacto** — con quien se habla. Tiene un teléfono de WhatsApp y una conversación.
 *   · **Viajero** — quien viaja. Puede no haber escrito nunca: la madre cotiza para su hijo.
 *   · **Pasajero** — una plaza en una reserva concreta, con su documento y su fecha de
 *     nacimiento. El mismo viajero es un pasajero distinto en cada viaje.
 *
 * Aquí vive el primero. Los otros dos pertenecen al archivo de viaje y llegan con él.
 *
 * Vocabulario: `docs/01-producto/02-lenguaje-ubicuo.md`.
 * Alcance y reglas: `docs/01-producto/09-especificacion-visual.json`.
 */

import { z } from 'zod';
import { Dinero, FechaViaje, Id, Instante, TelefonoE164, pagina } from './comunes.js';

// =============================================================================
// Contacto
// =============================================================================

/**
 * Para qué nos dio permiso el contacto.
 *
 * No es burocracia: la Ley 1581 de 2012 exige finalidad declarada, y Meta cierra números que
 * envían promociones sin consentimiento. Un contacto sin `PROMOCIONAL` puede recibir respuestas
 * a lo que preguntó, nunca una campaña.
 */
export const Consentimiento = z.enum(['TRANSACCIONAL', 'PROMOCIONAL']);
export type Consentimiento = z.infer<typeof Consentimiento>;

export const Contacto = z.object({
  id: Id,
  nombre: z.string().min(1).max(200).nullable(),
  telefono: TelefonoE164,
  correo: z.string().email().max(320).nullable(),
  /** Libres por tenant: «VIP», «Luna de miel», «Corporativo». Política de negocio, R12. */
  etiquetas: z.array(z.string().min(1).max(40)).max(20),
  /** Lo que conviene recordar para atender y para recomprar: alergias, asiento, aerolínea. */
  preferencias: z.string().max(2000).nullable(),
  consentimientos: z.array(Consentimiento),
  creadoEn: Instante,
  ultimoContactoEn: Instante.nullable(),
});
export type Contacto = z.infer<typeof Contacto>;

// =============================================================================
// Oportunidad
// =============================================================================

/**
 * Las etapas del pipeline.
 *
 * **Son el valor por defecto, no la verdad.** Cada agencia ordena su embudo distinto y R12 dice
 * que la política de negocio se parametriza: cuando exista la configuración por tenant, estas
 * cinco serán la semilla de una tabla, no un `enum` cerrado. Mientras tanto, cerradas.
 */
export const EtapaPipeline = z.enum([
  'NUEVO_LEAD',
  'EN_COTIZACION',
  'EN_NEGOCIACION',
  'GANADA',
  'PERDIDA',
]);
export type EtapaPipeline = z.infer<typeof EtapaPipeline>;

/**
 * Por qué se perdió.
 *
 * Exigirlo es una decisión de producto, no un capricho del formulario: sin motivo, el embudo
 * dice cuántas se pierden y nunca por qué, que es lo único que permite corregir algo. Si la
 * agencia pierde por precio hay que revisar el markup; si pierde por tiempo de respuesta, el
 * SLA; si el viajero se fue con otra agencia, el catálogo.
 */
export const MotivoPerdida = z.enum([
  'PRECIO',
  'TIEMPO_DE_RESPUESTA',
  'SIN_DISPONIBILIDAD',
  'COMPRO_EN_OTRA_AGENCIA',
  'VIAJE_APLAZADO',
  'NO_RESPONDE',
  'OTRO',
]);
export type MotivoPerdida = z.infer<typeof MotivoPerdida>;

/** Lo siguiente que hay que hacer, y cuándo. Lo que impide que una oportunidad se enfríe sola. */
export const ProximaTarea = z.object({
  descripcion: z.string().min(1).max(200),
  venceEn: Instante,
  completada: z.boolean(),
});
export type ProximaTarea = z.infer<typeof ProximaTarea>;

const camposOportunidad = {
  id: Id,
  contactoId: Id,
  /** Denormalizado para la tarjeta del tablero: pintarla no debería costar otra consulta. */
  contactoNombre: z.string().max(200).nullable(),
  /** «Paquete San Andrés Dic 2026». Lo escribe el asesor o lo propone la IA desde el chat. */
  titulo: z.string().min(1).max(200),
  destino: z.string().max(120).nullable(),
  /** Si ya se eligió un paquete del catálogo. Null mientras se explora. */
  paqueteId: Id.nullable(),
  fechaSalida: FechaViaje.nullable(),
  etapa: EtapaPipeline,
  /**
   * Estimado, no comprometido. Es lo que el asesor cree que vale, antes de que exista una
   * cotización firme — por eso puede ser null al principio y por eso NO se suma como venta.
   */
  valorEstimado: Dinero.nullable(),
  probabilidad: z.number().int().min(0).max(100).nullable(),
  asesorId: Id.nullable(),
  asesorNombre: z.string().max(200).nullable(),
  proximaTarea: ProximaTarea.nullable(),
  motivoPerdida: MotivoPerdida.nullable(),
  /** Texto libre del motivo. Obligatorio cuando el motivo es `OTRO`: si no, no explica nada. */
  notaPerdida: z.string().max(500).nullable(),
  creadaEn: Instante,
  ultimoContactoEn: Instante.nullable(),
};

/**
 * La regla de pérdida, en el contrato y no en el formulario.
 *
 * Ponerla aquí significa que la API la rechaza igual que la web, y que nadie puede marcar una
 * oportunidad como perdida desde una integración futura sin decir por qué.
 */
function exigirMotivoDePerdida(
  valor: { etapa: EtapaPipeline; motivoPerdida: MotivoPerdida | null; notaPerdida?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (valor.etapa === 'PERDIDA' && valor.motivoPerdida === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['motivoPerdida'],
      message:
        'Una oportunidad perdida necesita motivo: sin él el embudo dice cuántas se pierden y ' +
        'nunca por qué.',
    });
  }

  if (valor.etapa !== 'PERDIDA' && valor.motivoPerdida !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['motivoPerdida'],
      message: 'Solo una oportunidad en etapa PERDIDA lleva motivo de pérdida.',
    });
  }

  if (valor.motivoPerdida === 'OTRO' && !valor.notaPerdida?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['notaPerdida'],
      message: '«Otro» sin explicación no es un motivo. Escribe cuál fue.',
    });
  }
}

export const Oportunidad = z.object(camposOportunidad).superRefine(exigirMotivoDePerdida);
export type Oportunidad = z.infer<typeof Oportunidad>;

/** Crear: el resto lo pone el servidor. Una oportunidad nueva nace en `NUEVO_LEAD`. */
export const CrearOportunidad = z
  .object(camposOportunidad)
  .pick({
    contactoId: true,
    titulo: true,
    destino: true,
    paqueteId: true,
    fechaSalida: true,
    valorEstimado: true,
    asesorId: true,
  })
  .partial({
    destino: true,
    paqueteId: true,
    fechaSalida: true,
    valorEstimado: true,
    asesorId: true,
  });
export type CrearOportunidad = z.infer<typeof CrearOportunidad>;

/** Mover de etapa. Es su propia operación porque arrastrar una tarjeta no edita lo demás. */
export const MoverOportunidad = z
  .object({
    etapa: EtapaPipeline,
    motivoPerdida: MotivoPerdida.nullable().default(null),
    notaPerdida: z.string().max(500).nullable().default(null),
  })
  .superRefine(exigirMotivoDePerdida);
export type MoverOportunidad = z.infer<typeof MoverOportunidad>;

// =============================================================================
// Vistas del pipeline
// =============================================================================

/**
 * Una columna del tablero, con su total.
 *
 * El total viene calculado del servidor y **no es la suma de las tarjetas visibles**: una
 * columna con 40 oportunidades muestra las primeras y el total es el de las 40. Sumarlo en el
 * navegador daría una cifra menor cada vez que se pagina, que es peor que no darla.
 */
export const ColumnaPipeline = z.object({
  etapa: EtapaPipeline,
  total: z.number().int().min(0),
  valorTotal: Dinero.nullable(),
  oportunidades: z.array(Oportunidad),
});
export type ColumnaPipeline = z.infer<typeof ColumnaPipeline>;

export const TableroPipeline = z.object({ columnas: z.array(ColumnaPipeline) });
export type TableroPipeline = z.infer<typeof TableroPipeline>;

export const PaginaOportunidades = pagina(Oportunidad);
export type PaginaOportunidades = z.infer<typeof PaginaOportunidades>;

export const PaginaContactos = pagina(Contacto);
export type PaginaContactos = z.infer<typeof PaginaContactos>;

// =============================================================================
// El panel lateral de la bandeja
// =============================================================================

/**
 * Lo que se ve a la derecha del hilo, sin salir de la conversación.
 *
 * Existe como contrato propio y no como «el contacto más sus cosas» por una razón concreta: es
 * **una sola petición**. El asesor abre una conversación y necesita saber de inmediato quién es,
 * qué se le cotizó y qué hay que hacer después. Tres llamadas encadenadas aquí se notan.
 *
 * Las cotizaciones llegan como resumen —sin tarifa neta— porque este panel se mira delante del
 * cliente y el margen no es asunto suyo.
 */
export const CotizacionResumen = z.object({
  id: Id,
  version: z.number().int().min(1),
  titulo: z.string().max(200),
  precioVenta: Dinero,
  vigenteHasta: FechaViaje.nullable(),
  enviadaEn: Instante.nullable(),
});
export type CotizacionResumen = z.infer<typeof CotizacionResumen>;

export const FichaDeContacto = z.object({
  contacto: Contacto,
  /** La oportunidad viva. Si hay varias, la más reciente que no esté cerrada. */
  oportunidadActual: Oportunidad.nullable(),
  cotizaciones: z.array(CotizacionResumen),
  /** Identificadores de archivos de viaje ya confirmados. El detalle vive en su propia pantalla. */
  archivosDeViajeIds: z.array(Id),
  notasInternas: z.array(
    z.object({
      id: Id,
      autorNombre: z.string().max(200).nullable(),
      texto: z.string().max(2000),
      escritaEn: Instante,
    }),
  ),
});
export type FichaDeContacto = z.infer<typeof FichaDeContacto>;
