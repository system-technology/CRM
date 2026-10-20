/**
 * Lo que otros contextos le piden a `inbox`, sin importarlo ni tocar sus tablas. R4 y ADR-0004.
 *
 * Mismo esquema que `puertos-hacia-crm.ts`: el puerto corre DENTRO de la transacción del llamador,
 * bajo el tenant ya fijado, y el `tenantId` va además como argumento para el predicado de defensa
 * en profundidad.
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';

export abstract class PuertoConversacionesDeMiembro {
  /**
   * Pasa a «sin asignar» todas las conversaciones de un miembro que se da de baja, para que
   * vuelvan a la cola común. Sin esto, las conversaciones de quien se fue quedarían invisibles
   * para todo el que no es dueño (`docs/01-producto/12-visibilidad-de-conversaciones.md` §3).
   * Escribe en el outbox el evento de cada una, en la misma transacción. Devuelve cuántas.
   */
  abstract soltarLasDe(tx: ClienteTenant, tenantId: string, usuarioId: string): Promise<number>;
}
