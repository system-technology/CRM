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
 * Las cinco etapas canónicas.
 *
 * **No son la lista de etapas de una agencia: son el vocabulario común.** Cada agencia ordena su
 * embudo distinto —R12— y en la base `etapas_pipeline` es una tabla por tenant. Esta clave es el
 * puente: permite que un informe diga «cuántas se pierden» sin importar cómo las llame cada una.
 *
 * Una etapa puede **no tener clave**, y es legítimo: la agencia demo tenía siete etapas y aquí
 * solo caben cinco. Por eso `EtapaDefinida.clave` admite `null`.
 */
export const ClaveEtapa = z.enum([
  'NUEVO_LEAD',
  'EN_COTIZACION',
  'EN_NEGOCIACION',
  'GANADA',
  'PERDIDA',
]);
export type ClaveEtapa = z.infer<typeof ClaveEtapa>;

/**
 * Una etapa tal como la tiene configurada ESTA agencia.
 *
 * **El tablero se pinta desde estos datos, no desde el `enum`.** La primera versión del contrato
 * llevaba la etapa como valor cerrado, y eso dejaba fuera a cualquier agencia con una etapa de
 * más: existía en la base y no era representable en la API. Se corrigió antes de construir la
 * pantalla, que era el único momento en que salía barato.
 *
 * `esGanada` y `esPerdida` viajan con la etapa porque son lo que decide el comportamiento —si
 * sale del embudo, si exige motivo— y preguntarlo por la clave obligaría a ramificar sobre una
 * etiqueta que la agencia puede haber renombrado.
 */
export const EtapaDefinida = z.object({
  id: Id,
  clave: ClaveEtapa.nullable(),
  nombre: z.string().min(1).max(80),
  orden: z.number().int().min(0),
  probabilidad: z.number().int().min(0).max(100),
  esGanada: z.boolean(),
  esPerdida: z.boolean(),
});
export type EtapaDefinida = z.infer<typeof EtapaDefinida>;

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
  etapa: EtapaDefinida,
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
 * Las reglas de pérdida que el contrato PUEDE comprobar, y por qué no están todas aquí.
 *
 * Son tres reglas y viven en tres sitios distintos, a propósito:
 *
 *   1. **«OTRO» exige explicación** — aquí, y también como `CHECK` en la base. Se comprueba
 *      mirando la propia fila, así que puede estar en los dos sitios sin coste.
 *   2. **Perdida ⇒ motivo** y **motivo ⇒ perdida** — **no están aquí, y no es un olvido**: la
 *      etapa viaja como `etapaId`, y saber si ese id es una etapa de pérdida exige leer
 *      `etapas_pipeline`. Un esquema no lee otra tabla. Viven en el caso de uso, que sí puede,
 *      y salen como error de dominio tipado.
 *
 * La alternativa era que el cliente mandara «esto es una pérdida» junto al id. Eso es confiar en
 * quien llama para aplicar una regla que existe precisamente porque no se confía en quien llama.
 */
function exigirExplicacionDeOtro(
  valor: { motivoPerdida: MotivoPerdida | null; notaPerdida?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (valor.motivoPerdida === 'OTRO' && !valor.notaPerdida?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['notaPerdida'],
      message: '«Otro» sin explicación no es un motivo. Escribe cuál fue.',
    });
  }
}

export const Oportunidad = z.object(camposOportunidad).superRefine(exigirExplicacionDeOtro);
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

/**
 * Mover de etapa. Es su propia operación porque arrastrar una tarjeta no edita lo demás.
 *
 * Lleva `etapaId` y no una clave: el destino es una etapa **de esta agencia**, que puede ser una
 * que el vocabulario común no nombra.
 */
export const MoverOportunidad = z
  .object({
    etapaId: Id,
    motivoPerdida: MotivoPerdida.nullable().default(null),
    notaPerdida: z.string().max(500).nullable().default(null),
  })
  .superRefine(exigirExplicacionDeOtro);
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
  etapa: EtapaDefinida,
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

// =============================================================================
// Alta y edición de contacto (T-075)
// =============================================================================

/**
 * El teléfono se acepta tal como lo escribe una persona («+57 300 123 4567», «0057 300…») y el
 * servidor lo normaliza a E.164 con `PhoneNumber`; lo que sale en `Contacto.telefono` ya es
 * canónico. Sin código de país se rechaza: adivinarlo crea un contacto al que nunca llega nada.
 */
const telefonoEscrito = z.string().trim().min(8).max(30);

export const CrearContacto = z.object({
  telefono: telefonoEscrito,
  nombre: z.string().trim().min(1).max(200).nullish(),
  correo: z.string().trim().email().max(320).nullish(),
  etiquetas: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  /** R10: puede contener dato de salud. No entra al índice de búsqueda ni a la auditoría. */
  preferencias: z.string().max(2000).nullish(),
});
export type CrearContacto = z.infer<typeof CrearContacto>;

/**
 * Edición parcial (`PATCH`): lo que no viene no se toca; `null` borra un campo opcional.
 * Cambiar `telefono` cambia la llave del canal de WhatsApp: si ya lo tiene otro contacto de la
 * agencia, responde 409 `TELEFONO_YA_REGISTRADO`.
 */
export const EditarContacto = z
  .object({
    telefono: telefonoEscrito,
    nombre: z.string().trim().min(1).max(200).nullable(),
    correo: z.string().trim().email().max(320).nullable(),
    etiquetas: z.array(z.string().trim().min(1).max(40)).max(20),
    preferencias: z.string().max(2000).nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'No hay nada que editar.',
  });
export type EditarContacto = z.infer<typeof EditarContacto>;

/**
 * Crear oportunidad desde una conversación: `POST /api/v1/crm/conversaciones/:id/oportunidades`.
 * El contacto sale de la conversación (no viaja en el cuerpo). Si no se manda `asesorId`, queda
 * asignada a quien la crea.
 */
export const CrearOportunidadDeConversacion = CrearOportunidad.omit({ contactoId: true });
export type CrearOportunidadDeConversacion = z.infer<typeof CrearOportunidadDeConversacion>;

// =============================================================================
// Seguimientos (T-077)
// =============================================================================

/**
 * Un seguimiento: algo que un asesor se comprometió a hacer, con fecha, sobre una oportunidad o
 * sobre una conversación (exactamente una de las dos).
 */
export const Seguimiento = z.object({
  id: Id,
  descripcion: z.string().min(1).max(200),
  venceEn: Instante,
  /** Null mientras esté pendiente. */
  completadoEn: Instante.nullable(),
  asesorId: Id.nullable(),
  asesorNombre: z.string().max(200).nullable(),
  contactoId: Id,
  contactoNombre: z.string().max(200).nullable(),
  oportunidadId: Id.nullable(),
  oportunidadTitulo: z.string().max(200).nullable(),
  conversacionId: Id.nullable(),
});
export type Seguimiento = z.infer<typeof Seguimiento>;

/** `POST /api/v1/crm/seguimientos`. El asesor lo fija el servidor (ver la ruta). */
export const CrearSeguimiento = z
  .object({
    descripcion: z.string().trim().min(1).max(200),
    venceEn: Instante,
    oportunidadId: Id.optional(),
    conversacionId: Id.optional(),
  })
  .refine((v) => (v.oportunidadId === undefined) !== (v.conversacionId === undefined), {
    message: 'Indica oportunidadId o conversacionId, uno solo.',
  });
export type CrearSeguimiento = z.infer<typeof CrearSeguimiento>;

export const EstadoSeguimiento = z.enum(['PENDIENTE', 'COMPLETADO', 'TODOS']);
export type EstadoSeguimiento = z.infer<typeof EstadoSeguimiento>;

/** Query de `GET /api/v1/crm/seguimientos`. `asesorId=yo` es el atajo del usuario en sesión. */
export const FiltroSeguimientos = z.object({
  asesorId: z.union([Id, z.literal('yo')]).optional(),
  oportunidadId: Id.optional(),
  conversacionId: Id.optional(),
  estado: EstadoSeguimiento.default('PENDIENTE'),
});
export type FiltroSeguimientos = z.infer<typeof FiltroSeguimientos>;

export const PaginaSeguimientos = pagina(Seguimiento);
export type PaginaSeguimientos = z.infer<typeof PaginaSeguimientos>;

/**
 * `GET /api/v1/crm/seguimientos/pendientes-del-dia[?asesorId=]` — lo que alimenta el inicio del
 * asesor. «Hoy» se calcula en la zona horaria de la agencia (R9), no en la del servidor.
 */
export const PendientesDelDia = z.object({
  /** AAAA-MM-DD del «hoy» de la agencia con que se calculó. */
  fecha: FechaViaje,
  /** Pendientes cuya fecha ya pasó antes de hoy, los más viejos primero. */
  vencidos: z.array(Seguimiento),
  /** Pendientes que vencen hoy (incluidos los que ya pasaron de hora), por hora. */
  deHoy: z.array(Seguimiento),
});
export type PendientesDelDia = z.infer<typeof PendientesDelDia>;

// =============================================================================
// Campos personalizados por agencia (T-026)
// =============================================================================

/** Tipos de datos admitidos para campos personalizados configurados por la agencia (R12). */
export const TipoCampoPersonalizado = z.enum(['texto', 'numero', 'fecha', 'lista']);
export type TipoCampoPersonalizado = z.infer<typeof TipoCampoPersonalizado>;

/** Entidades comerciales que admiten campos personalizados. */
export const EntidadCampoPersonalizado = z.enum(['contacto', 'oportunidad']);
export type EntidadCampoPersonalizado = z.infer<typeof EntidadCampoPersonalizado>;

/**
 * Definición de un campo personalizado por la agencia (R12).
 * Permite a agencias de turismo extender contactos y oportunidades con atributos propios
 * (pasaportes, preferencias aéreas, presupuestos, flexibilidad de fechas).
 */
export const DefinicionCampoPersonalizado = z.object({
  id: z.string().min(1),
  entidad: EntidadCampoPersonalizado,
  nombre: z.string().min(1).max(100),
  clave: z.string().min(1).max(80),
  tipo: TipoCampoPersonalizado,
  opciones: z.array(z.string().min(1).max(100)).optional(),
  requerido: z.boolean().default(false),
  descripcion: z.string().max(300).optional(),
});
export type DefinicionCampoPersonalizado = z.infer<typeof DefinicionCampoPersonalizado>;

export const ValorCampoPersonalizado = z.object({
  campoId: z.string().min(1),
  clave: z.string().min(1).max(80),
  valor: z.union([z.string(), z.number(), z.boolean()]).nullable(),
});
export type ValorCampoPersonalizado = z.infer<typeof ValorCampoPersonalizado>;
