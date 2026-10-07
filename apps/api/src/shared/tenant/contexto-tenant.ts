/**
 * Contexto de tenant por petición.
 *
 * ESTA ES LA PIEZA QUE HACE QUE EL AISLAMIENTO FUNCIONE.
 *
 * Las políticas RLS de PostgreSQL comparan `tenant_id` contra `app.current_tenant`. Si ese
 * parámetro no se fija en la transacción, las consultas devuelven cero filas —el sistema se
 * queda ciego, que es seguro—. Pero si se fijara con el valor equivocado, una agencia vería
 * los datos de otra.
 *
 * Por eso el `tenantId` viaja en almacenamiento local asíncrono y NO como argumento: pasarlo a
 * mano por cada capa significa que alguien, algún día, olvidará pasarlo o pasará el de otro.
 *
 * Y por eso se deriva SIEMPRE del token de sesión, nunca de un parámetro del cliente. Un
 * `tenantId` que viaja en el cuerpo de una petición es un hallazgo crítico de auditoría.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface ContextoPeticion {
  readonly tenantId: string;
  readonly usuarioId: string | null;
  /** Para correlacionar logs y trazas con una petición concreta. */
  readonly trazaId: string;
}

const almacen = new AsyncLocalStorage<ContextoPeticion>();

export class SinContextoTenantError extends Error {
  readonly code = 'SIN_CONTEXTO_TENANT';
  constructor() {
    super(
      'Se intentó acceder a datos sin contexto de tenant. Toda operación debe ejecutarse ' +
        'dentro de ContextoTenant.ejecutarCon().',
    );
  }
}

export const ContextoTenant = {
  /** Ejecuta `fn` con el contexto fijado. Todo lo que ocurra dentro lo verá. */
  ejecutarCon<T>(contexto: ContextoPeticion, fn: () => T): T {
    return almacen.run(contexto, fn);
  },

  /**
   * Devuelve el contexto actual o lanza.
   *
   * Lanzar y no devolver `null` es deliberado: un repositorio que recibiera `null` podría
   * seguir adelante y construir una consulta sin filtro. Aquí el fallo es inmediato y ruidoso.
   */
  obtener(): ContextoPeticion {
    const contexto = almacen.getStore();
    if (!contexto) throw new SinContextoTenantError();
    return contexto;
  },

  /** Igual que `obtener`, pero sin lanzar. Solo para logs y métricas. */
  obtenerONulo(): ContextoPeticion | null {
    return almacen.getStore() ?? null;
  },

  tenantId(): string {
    return ContextoTenant.obtener().tenantId;
  },
};
