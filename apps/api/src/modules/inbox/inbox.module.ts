/**
 * Contexto delimitado `inbox`: la bandeja de conversaciones de WhatsApp.
 *
 * Expone el webhook, la bandeja del asesor (REST) y la bandeja en vivo (Socket.IO). La visibilidad
 * de las conversaciones dentro de la agencia es una sola regla: `shared/autorizacion/`.
 *
 * No importa ningún otro módulo de negocio, ni lo hará: R4.
 */

import { Module } from '@nestjs/common';
import { ActuarEnConversacionUseCase } from './application/actuar-en-conversacion.js';
import { ConsultarBandejaUseCase } from './application/consultar-bandeja.js';
import { EmitirEventosEnVivo } from './application/emitir-eventos-en-vivo.js';
import { PuertoConversaciones } from './application/puertos-de-conversaciones.js';
import {
  PuertoAvisoAlRelay,
  PuertoEmisionEnVivo,
  PuertoLecturaDeConversaciones,
  PuertoLecturaDeMensajes,
  PuertoPublicadorDeEventos,
  PuertoSuscriptorDeEventos,
} from './application/puertos-de-eventos.js';
import {
  BUS_EN_MEMORIA,
  crearAvisoAlRelay,
  crearBusEnMemoriaSiSePide,
  crearPublicadorDeLaApi,
  crearSuscriptor,
} from './infrastructure/crear-bus.js';
import { ConversacionesPrisma } from './infrastructure/conversaciones.prisma.js';
import { LecturaDeConversacionesPrisma } from './infrastructure/lectura-de-conversaciones.prisma.js';
import { LecturaDeMensajesPrisma } from './infrastructure/lectura-de-mensajes.prisma.js';
import { InboxPuertosModule } from './inbox-puertos.module.js';
import { ConversacionesController } from './interface/conversaciones.controller.js';
import { BandejaEnVivoGateway } from './interface/bandeja-en-vivo.gateway.js';
import { SuscripcionEnVivo } from './interface/suscripcion-en-vivo.js';
import { PuertoRecepciones } from './application/puerto-recepciones.js';
import { PuertoColaDeChanges } from './application/puertos-de-proceso.js';
import { ColaDeChangesBullmq } from './infrastructure/cola-de-changes.bullmq.js';
import { ColaDeChangesInerte } from './infrastructure/cola-de-changes.inerte.js';
import { RegistrarRecepcion } from './application/registrar-recepcion.js';
import { RecepcionesPrisma } from './infrastructure/recepciones.prisma.js';
import { WebhookWhatsappController } from './interface/webhook-whatsapp.controller.js';

@Module({
  imports: [InboxPuertosModule],
  controllers: [WebhookWhatsappController, ConversacionesController],
  providers: [
    RegistrarRecepcion,
    // --- La bandeja del asesor (REST): visibilidad dentro de la agencia ----------------------
    ConsultarBandejaUseCase,
    ActuarEnConversacionUseCase,
    { provide: PuertoConversaciones, useClass: ConversacionesPrisma },
    { provide: PuertoAvisoAlRelay, useFactory: crearAvisoAlRelay, inject: [BUS_EN_MEMORIA] },
    // --- Bandeja en vivo (Socket.IO) -----------------------------------------------------
    BandejaEnVivoGateway,
    { provide: PuertoEmisionEnVivo, useExisting: BandejaEnVivoGateway },
    EmitirEventosEnVivo,
    SuscripcionEnVivo,
    { provide: PuertoLecturaDeMensajes, useClass: LecturaDeMensajesPrisma },
    { provide: PuertoLecturaDeConversaciones, useClass: LecturaDeConversacionesPrisma },
    // El bus se elige al instanciar: `BUS_DE_EVENTOS=memoria` o Redis.
    { provide: BUS_EN_MEMORIA, useFactory: crearBusEnMemoriaSiSePide },
    {
      provide: PuertoSuscriptorDeEventos,
      useFactory: crearSuscriptor,
      inject: [BUS_EN_MEMORIA],
    },
    {
      provide: PuertoPublicadorDeEventos,
      useFactory: crearPublicadorDeLaApi,
      inject: [BUS_EN_MEMORIA],
    },
    { provide: PuertoRecepciones, useClass: RecepcionesPrisma },
    {
      // Cola explícita, sin respaldo silencioso: o hay Redis o se declara 'inerte'.
      provide: PuertoColaDeChanges,
      useFactory: (): PuertoColaDeChanges => {
        if (process.env['COLA_CHANGES'] === 'inerte') return new ColaDeChangesInerte();
        const url = process.env['REDIS_URL'];
        if (!url) throw new Error('Falta REDIS_URL (o COLA_CHANGES=inerte en desarrollo).');
        return new ColaDeChangesBullmq(url);
      },
    },
  ],
})
export class InboxModule {}
