import { Module } from '@nestjs/common';
import { PuertoCorreo } from './domain/puerto-correo.js';
import { crearCorreo } from './infrastructure/crear-correo.js';
import { ConsumidorDeCorreo } from './interface/consumidor-de-correo.js';

/** Notificaciones, lado trabajador: recoge de la cola y envía por el puerto elegido. */
@Module({
  providers: [
    ConsumidorDeCorreo,
    { provide: PuertoCorreo, useFactory: (): PuertoCorreo => crearCorreo(process.env) },
  ],
})
export class NotificationsWorkerModule {}
