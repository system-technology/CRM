/**
 * El módulo del PROCESO trabajador. Aparte de `InboxModule` a propósito: la API no debe poder
 * construir `PrismaWebhookService` (rol `viajapro_webhook`), ni el trabajador `PrismaService`.
 */
import { Module } from '@nestjs/common';
import { ProcesarChange } from './application/procesar-change.js';
import { PuertoBandeja, PuertoStaging } from './application/puertos-de-proceso.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import { StagingPrisma } from './infrastructure/staging.prisma.js';
import { BarrerPendientes } from './application/barrer-pendientes.js';
import {
  PuertoCoordinacionDelBarrido,
  PuertoPendientes,
  PuertoReencolador,
} from './application/puertos-de-barrido.js';
import { BarridoBullmq } from './infrastructure/barrido.bullmq.js';
import { PendientesPrisma } from './infrastructure/pendientes.prisma.js';
import { RelevarOutbox } from './application/relevar-outbox.js';
import {
  PuertoAvisoDeOutbox,
  PuertoOutbox,
  PuertoPublicadorDeEventos,
} from './application/puertos-de-eventos.js';
import { AvisosDeOutboxEnMemoria } from './infrastructure/avisos-de-outbox.en-memoria.js';
import { crearPublicadorDelTrabajador } from './infrastructure/crear-bus.js';
import { OutboxPrisma } from './infrastructure/outbox.prisma.js';
import { EscuchaDeAvisosDelRelay } from './infrastructure/aviso-al-relay.redis.js';
import { PlanificadorDeRelay } from './interface/planificador-de-relay.js';
import { ConsumidorDeChanges } from './interface/consumidor-de-changes.js';
import { PlanificadorDeBarrido } from './interface/planificador-de-barrido.js';
import { EnviarMensajeSaliente } from './application/enviar-mensaje-saliente.js';
import {
  PuertoColaDeEnvios,
  PuertoCredencialesWhatsapp,
  PuertoEnvioWhatsapp,
  PuertoMensajesSalientes,
  PuertoReservaDeEnvio,
} from './application/puertos-de-envio.js';
import {
  ColaDeEnviosBullmq,
  ReservaDeEnvioRedis,
  urlDeRedisParaEnvios,
} from './infrastructure/cola-de-envios.bullmq.js';
import {
  crearCredencialesWhatsapp,
  crearEnvioWhatsapp,
} from './infrastructure/crear-envio-whatsapp.js';
import { MensajesSalientesPrisma } from './infrastructure/mensajes-salientes.prisma.js';
import { ConsumidorDeEnvios } from './interface/consumidor-de-envios.js';

@Module({
  providers: [
    PrismaWebhookService,
    ProcesarChange,
    ConsumidorDeChanges,
    BarrerPendientes,
    PlanificadorDeBarrido,
    // --- Relay del outbox: de la base al bus, sin saber que existen sockets ---
    RelevarOutbox,
    PlanificadorDeRelay,
    { provide: PuertoOutbox, useClass: OutboxPrisma },
    { provide: PuertoAvisoDeOutbox, useClass: AvisosDeOutboxEnMemoria },
    { provide: PuertoPublicadorDeEventos, useFactory: crearPublicadorDelTrabajador },
    {
      // La API avisa por Redis cuando escribe un evento: se vuelve una pista del relay.
      provide: EscuchaDeAvisosDelRelay,
      useFactory: (pistas: PuertoAvisoDeOutbox): EscuchaDeAvisosDelRelay => {
        const url = process.env['REDIS_URL'];
        if (!url) throw new Error('Falta REDIS_URL: el relay no recibe los avisos de la API.');
        return new EscuchaDeAvisosDelRelay(url, pistas);
      },
      inject: [PuertoAvisoDeOutbox],
    },
    { provide: PuertoPendientes, useClass: PendientesPrisma },
    {
      // Una sola instancia con dos caras: la cola y la coordinación comparten conexión.
      provide: BarridoBullmq,
      useFactory: (): BarridoBullmq => {
        const url = process.env['REDIS_URL'];
        if (!url) throw new Error('Falta REDIS_URL: el barrido no tiene dónde mirar.');
        return new BarridoBullmq(url);
      },
    },
    { provide: PuertoReencolador, useExisting: BarridoBullmq },
    { provide: PuertoCoordinacionDelBarrido, useExisting: BarridoBullmq },
    { provide: PuertoStaging, useClass: StagingPrisma },
    { provide: PuertoBandeja, useClass: BandejaPrisma },
    // --- Envío saliente por WhatsApp (ADR-0018): el relay encola, este consumidor envía ---
    EnviarMensajeSaliente,
    ConsumidorDeEnvios,
    { provide: PuertoMensajesSalientes, useClass: MensajesSalientesPrisma },
    { provide: PuertoEnvioWhatsapp, useFactory: (): PuertoEnvioWhatsapp => crearEnvioWhatsapp() },
    {
      provide: PuertoCredencialesWhatsapp,
      useFactory: (): PuertoCredencialesWhatsapp => crearCredencialesWhatsapp(),
    },
    {
      provide: PuertoColaDeEnvios,
      useFactory: (): PuertoColaDeEnvios => new ColaDeEnviosBullmq(urlDeRedisParaEnvios()),
    },
    {
      provide: PuertoReservaDeEnvio,
      useFactory: (): PuertoReservaDeEnvio => new ReservaDeEnvioRedis(urlDeRedisParaEnvios()),
    },
  ],
})
export class InboxWorkerModule {}
