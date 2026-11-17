/**
 * Las notificaciones del usuario de la sesión (T-254): listar y marcar leída. El usuario sale de
 * `ContextoTenant` (la sesión), nunca de un parámetro; el tenant lo fija `conTenant` y lo hace
 * cumplir RLS. La notificación de otro usuario —de la misma agencia o de otra— es un 404.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ListaDeNotificaciones,
  ListarNotificaciones,
  Notificacion,
} from '@viajapro/contracts';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { NotificacionNoEncontradaError } from '../domain/errors-de-avisos.js';
import { RepositorioDeNotificacionesDelUsuario } from './puertos-de-notificaciones.js';

@Injectable()
export class NotificacionesDelUsuarioUseCase {
  constructor(
    @Inject(RepositorioDeNotificacionesDelUsuario)
    private readonly notificaciones: RepositorioDeNotificacionesDelUsuario,
  ) {}

  async listar(filtro: ListarNotificaciones): Promise<ListaDeNotificaciones> {
    const { usuarioId } = ContextoTenant.obtener();
    // Sin usuario (atajo de desarrollo): nadie tiene notificaciones.
    if (!usuarioId) return { datos: [], noLeidas: 0 };
    // Hoy todas las notificaciones son avisos de plazo de un archivo de viaje: quien perdió
    // `archivo.ver` (cambio de rol) deja de verlas, aunque se crearon cuando lo tenía.
    if (!ContextoTenant.tienePermiso('archivo.ver')) return { datos: [], noLeidas: 0 };
    return this.notificaciones.listar(usuarioId, filtro.limite);
  }

  async marcarLeida(notificacionId: string): Promise<Notificacion> {
    const { usuarioId } = ContextoTenant.obtener();
    if (!usuarioId) throw new NotificacionNoEncontradaError(notificacionId);
    const n = await this.notificaciones.marcarLeida(usuarioId, notificacionId, new Date());
    if (!n) throw new NotificacionNoEncontradaError(notificacionId);
    return n;
  }
}
