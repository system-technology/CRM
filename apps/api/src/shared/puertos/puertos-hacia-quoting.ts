/**
 * Los puertos por los que otros contextos piden cosas a `quoting` sin importarlo ni tocar sus
 * tablas. R4 y ADR-0004. Mismo esquema que `puertos-hacia-crm.ts`: los define quien los necesita,
 * viven en `shared/`, `quoting` los implementa y los registra con estos símbolos.
 *
 * Cada método recibe la transacción `tx` del llamador (ya con `app.current_tenant` fijado) y el
 * `tenantId` explícito como defensa en profundidad (R1).
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';

/** Lo que `crm` necesita de `quoting`: comprobar que un paquete del catálogo existe. */
export abstract class PuertoExistenciaDePaquete {
  /** El paquete existe en ese tenant y no está eliminado. */
  abstract existePaquete(tx: ClienteTenant, tenantId: string, paqueteId: string): Promise<boolean>;
}
