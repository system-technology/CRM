import { Module } from '@nestjs/common';
import { NotificacionesDelUsuarioUseCase } from './application/notificaciones-del-usuario.use-case.js';
import {
  RepositorioDeAvisos,
  RepositorioDeNotificacionesDelUsuario,
} from './application/puertos-de-notificaciones.js';
import { RegistrarAvisoDePlazoUseCase } from './application/registrar-aviso-de-plazo.use-case.js';
import {
  RepositorioDeAvisosPrisma,
  RepositorioDeNotificacionesDelUsuarioPrisma,
} from './infrastructure/notificaciones.prisma.js';
import { ConsumidoresDeAvisosDePlazo } from './interface/consumidores-de-avisos-de-plazo.js';
import { NotificacionesController } from './interface/notificaciones.controller.js';

/**
 * Notificaciones EN LA APLICACIÓN (T-254, ADR-0024 §3.6): los consumidores de los cuatro avisos de
 * plazo y las rutas del usuario. Es un módulo aparte de `NotificationsModule` (la cola de correo)
 * porque necesita `PrismaService` (rol `viajapro_app`) y el despachador, que solo viven en el
 * contenedor de la API: el trabajador no puede cargarlo y `NotificationsModule` se carga solo en
 * pruebas sin base.
 *
 * No importa `booking`, `crm` ni `identity` (R4): habla con ellos por los puertos de
 * `shared/puertos/puertos-para-avisos.ts`, que ellos implementan.
 */
@Module({
  controllers: [NotificacionesController],
  providers: [
    RegistrarAvisoDePlazoUseCase,
    { provide: RepositorioDeAvisos, useClass: RepositorioDeAvisosPrisma },
    ConsumidoresDeAvisosDePlazo,
    NotificacionesDelUsuarioUseCase,
    {
      provide: RepositorioDeNotificacionesDelUsuario,
      useClass: RepositorioDeNotificacionesDelUsuarioPrisma,
    },
  ],
})
export class NotificationsAvisosModule {}
