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
import { ConsultarEstadoDelCanal } from './application/consultar-estado-del-canal.js';
import { PuertoEstadoDelCanal } from './application/puerto-estado-del-canal.js';
import { EstadoDelCanalPrisma } from './infrastructure/estado-del-canal.prisma.js';
import { CanalesController } from './interface/canales.controller.js';
import { EnviarCotizacionPorWhatsapp } from './application/enviar-cotizacion-por-whatsapp.js';
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
import {
  COMPARTIDO_DEL_INBOX,
  type CompartidoDelInbox,
} from './infrastructure/compartido-en-proceso.js';
import { esModoUnico } from '../../shared/despliegue/modo-de-despliegue.js';
import { RegistrarRecepcion } from './application/registrar-recepcion.js';
import { RecepcionesPrisma } from './infrastructure/recepciones.prisma.js';
import { WebhookWhatsappController } from './interface/webhook-whatsapp.controller.js';

@Module({
  imports: [InboxPuertosModule],
  controllers: [WebhookWhatsappController, ConversacionesController, CanalesController],
  providers: [
    RegistrarRecepcion,
    // --- Estado del canal de WhatsApp (T-122) ---
    ConsultarEstadoDelCanal,
    { provide: PuertoEstadoDelCanal, useClass: EstadoDelCanalPrisma },
    // --- La bandeja del asesor (REST): visibilidad dentro de la agencia ----------------------
    ConsultarBandejaUseCase,
    ActuarEnConversacionUseCase,
    EnviarCotizacionPorWhatsapp,
    { provide: PuertoConversaciones, useClass: ConversacionesPrisma },
    {
      provide: PuertoAvisoAlRelay,
      useFactory: crearAvisoAlRelay,
      inject: [BUS_EN_MEMORIA, { token: COMPARTIDO_DEL_INBOX, optional: true }],
    },
    // --- Bandeja en vivo (Socket.IO) -----------------------------------------------------
    BandejaEnVivoGateway,
    { provide: PuertoEmisionEnVivo, useExisting: BandejaEnVivoGateway },
    EmitirEventosEnVivo,
    SuscripcionEnVivo,
    { provide: PuertoLecturaDeMensajes, useClass: LecturaDeMensajesPrisma },
    { provide: PuertoLecturaDeConversaciones, useClass: LecturaDeConversacionesPrisma },
    // El bus se elige al instanciar: `BUS_DE_EVENTOS=memoria` o Redis.
    // En modo `unico` el bus es el compartido con el contexto del trabajador (ADR-0019 §1.1).
    {
      provide: BUS_EN_MEMORIA,
      useFactory: crearBusEnMemoriaSiSePide,
      inject: [{ token: COMPARTIDO_DEL_INBOX, optional: true }],
    },
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
      // Cola explícita, sin respaldo silencioso: en modo `unico` la compartida en proceso; si no,
      // o hay Redis o se declara 'inerte'.
      provide: PuertoColaDeChanges,
      inject: [{ token: COMPARTIDO_DEL_INBOX, optional: true }],
      useFactory: (compartido?: CompartidoDelInbox | null): PuertoColaDeChanges => {
        if (compartido) return compartido.colaDeChanges;
        if (esModoUnico(process.env)) {
          throw new Error(
            'MODO_DESPLIEGUE=unico exige arrancar con main-unico.ts: aquí no hay cola en proceso.',
          );
        }
        if (process.env['COLA_CHANGES'] === 'inerte') return new ColaDeChangesInerte();
        const url = process.env['REDIS_URL'];
        if (!url) throw new Error('Falta REDIS_URL (o COLA_CHANGES=inerte en desarrollo).');
        return new ColaDeChangesBullmq(url);
      },
    },
  ],
})
export class InboxModule {}
