/**
 * El módulo del PROCESO trabajador, modo `escalado` (BullMQ y Redis). Aparte de `InboxModule` a
 * propósito: la API no debe poder construir `PrismaWebhookService` (rol `viajapro_webhook`), ni el
 * trabajador `PrismaService`. El modo `unico` tiene el suyo: `inbox-worker-unico.module.ts`.
 */
import { Module } from '@nestjs/common';
import {
  PuertoCoordinacionDelBarrido,
  PuertoReencolador,
} from './application/puertos-de-barrido.js';
import {
  PuertoAvisoDeOutbox,
  PuertoPublicadorDeEventos,
} from './application/puertos-de-eventos.js';
import { PuertoColaDeEnvios, PuertoReservaDeEnvio } from './application/puertos-de-envio.js';
import { AvisosDeOutboxEnMemoria } from './infrastructure/avisos-de-outbox.en-memoria.js';
import { EscuchaDeAvisosDelRelay } from './infrastructure/aviso-al-relay.redis.js';
import { BarridoBullmq } from './infrastructure/barrido.bullmq.js';
import {
  ColaDeEnviosBullmq,
  ReservaDeEnvioRedis,
  urlDeRedisParaEnvios,
} from './infrastructure/cola-de-envios.bullmq.js';
import { crearPublicadorDelTrabajador } from './infrastructure/crear-bus.js';
import { PROVEEDORES_COMUNES_DEL_TRABAJADOR } from './inbox-worker-comun.js';
import { ConsumidorDeChanges } from './interface/consumidor-de-changes.js';
import { ConsumidorDeEnvios } from './interface/consumidor-de-envios.js';
import { PlanificadorDeBarrido } from './interface/planificador-de-barrido.js';
import { PlanificadorDeRelay } from './interface/planificador-de-relay.js';

@Module({
  providers: [
    ...PROVEEDORES_COMUNES_DEL_TRABAJADOR,
    ConsumidorDeChanges,
    PlanificadorDeBarrido,
    PlanificadorDeRelay,
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
    ConsumidorDeEnvios,
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
