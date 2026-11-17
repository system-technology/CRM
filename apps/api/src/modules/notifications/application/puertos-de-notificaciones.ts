/**
 * Puertos de persistencia de las notificaciones en la aplicación (T-254).
 *
 * Dos, porque corren en contextos distintos: el del consumidor recibe la transacción del
 * despachador (ya con el tenant fijado); el de la API abre la suya bajo el tenant de la petición.
 */
import type { Notificacion, TipoDeNotificacion } from '@viajapro/contracts';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type { NotificacionPorCrear } from '../domain/aviso-de-plazo.js';

export abstract class RepositorioDeAvisos {
  /**
   * Inserta con `ON CONFLICT DO NOTHING` sobre `(tenant, evento, usuario)`: devuelve cuántas
   * filas NUEVAS escribió (0 si el evento ya había avisado a todos).
   */
  abstract crear(
    tx: ClienteTenant,
    tenantId: string,
    nuevas: readonly NotificacionPorCrear[],
  ): Promise<number>;
}

export interface NotificacionesDelUsuario {
  datos: Notificacion[];
  noLeidas: number;
}

export abstract class RepositorioDeNotificacionesDelUsuario {
  /** No leídas primero, luego la más reciente. Solo las de `usuarioId` en el tenant de la petición. */
  abstract listar(usuarioId: string, limite: number): Promise<NotificacionesDelUsuario>;
  /** Marca leída (conserva la hora si ya lo estaba). `null` si no existe o no es de ese usuario. */
  abstract marcarLeida(
    usuarioId: string,
    notificacionId: string,
    ahora: Date,
  ): Promise<Notificacion | null>;
}

export type { TipoDeNotificacion };
