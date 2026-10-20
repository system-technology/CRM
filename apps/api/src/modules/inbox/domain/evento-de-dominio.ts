/**
 * El evento de dominio tal como viaja entre procesos (trabajador -> API), y los nombres de las
 * salas de tiempo real.
 *
 * **Solo identificadores.** El evento sale del outbox, y el outbox no lleva texto de mensajes ni
 * teléfonos (R10: esas tablas se leen con otros criterios de retención). Quien necesita el
 * contenido —la API, para el socket— lo lee de la base, bajo RLS y con el tenant del evento. Así el
 * texto de un viajero nunca pasa por Redis.
 */
import { z } from 'zod';

/** Canal único de pub/sub. Cada réplica de la API se suscribe y sirve a SUS sockets. */
export const CANAL_DE_EVENTOS = 'viajapro:eventos';

export const EventoDeDominio = z.object({
  /** Identificador del outbox. Sirve para que un cliente deduplique si el relay repite. */
  id: z.string().min(1).max(40),
  tipo: z.string().min(1).max(120),
  tenantId: z.string().uuid(),
  agregadoId: z.string().uuid(),
  /** Solo identificadores y banderas; nunca contenido de negocio. */
  payload: z.record(z.unknown()),
});
export type EventoDeDominio = z.infer<typeof EventoDeDominio>;

/** `inbox.mensaje_recibido`: un mensaje entrante quedó guardado. */
export const TIPO_MENSAJE_RECIBIDO = 'inbox.mensaje_recibido';

/**
 * `identity.acceso_revocado`: se dio de baja a un usuario o se revocó su sesión. El gateway cierra
 * sus sockets sin esperar a la revalidación. Es el mecanismo principal; el intervalo de 60 s es el
 * respaldo para cuando este evento se pierde (ADR-0011).
 */
export const TIPO_ACCESO_REVOCADO = 'identity.acceso_revocado';
export const CargaDeAccesoRevocado = z.object({ usuarioId: z.string().uuid() });

/** Las salas las asigna el SERVIDOR a partir de la sesión. El cliente no puede nombrarlas. */
export const salaDeTenant = (tenantId: string): string => `tenant:${tenantId}`;
export const salaDeUsuario = (usuarioId: string): string => `usuario:${usuarioId}`;

/** `inbox.mensaje_saliente_creado`: un miembro respondió y el mensaje quedó guardado (pendiente de envío). */
export const TIPO_MENSAJE_SALIENTE_CREADO = 'inbox.mensaje_saliente_creado';

/**
 * `inbox.conversacion_actualizada`: cambió la asignación, el estado o el contador de sin leer.
 * La carga lleva solo el id de quien la tenía asignada ANTES (nulo = sin asignar): con él se
 * calcula quién dejó de verla. Ausente = nadie perdió visibilidad.
 */
export const TIPO_CONVERSACION_ACTUALIZADA = 'inbox.conversacion_actualizada';
export const CargaDeConversacionActualizada = z.object({
  anteriorAsignadoAId: z.string().uuid().nullable().optional(),
});

/** El aviso que la API le manda al trabajador para que vacíe el outbox de una agencia YA. */
export const CANAL_DE_AVISOS_DEL_RELAY = 'viajapro:aviso-relay';
