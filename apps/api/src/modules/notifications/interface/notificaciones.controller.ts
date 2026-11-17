/**
 * Las notificaciones en la aplicación del usuario de la sesión (T-254).
 *
 * - `GET  /api/v1/notificaciones`               las propias, no leídas primero
 * - `POST /api/v1/notificaciones/:id/lectura`   la marca leída
 *
 * Sin permiso específico: cualquier miembro de la agencia ve SUS notificaciones; lo que ve lo
 * decidió quien la creó (solo a quien puede operar archivos). Ni el tenant ni el usuario viajan en
 * la petición: salen de la sesión.
 */
import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  type ListaDeNotificaciones,
  ListarNotificaciones,
  type Notificacion,
} from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { NotificacionesDelUsuarioUseCase } from '../application/notificaciones-del-usuario.use-case.js';

@Controller('api/v1/notificaciones')
export class NotificacionesController {
  constructor(
    @Inject(NotificacionesDelUsuarioUseCase)
    private readonly notificaciones: NotificacionesDelUsuarioUseCase,
  ) {}

  @Get()
  async listar(
    @Query(new ZodValidationPipe(ListarNotificaciones)) params: ListarNotificaciones,
  ): Promise<ListaDeNotificaciones> {
    return this.notificaciones.listar(params);
  }

  @Post(':id/lectura')
  async marcarLeida(@Param('id', new ParseUUIDPipe()) id: string): Promise<Notificacion> {
    return this.notificaciones.marcarLeida(id);
  }
}
