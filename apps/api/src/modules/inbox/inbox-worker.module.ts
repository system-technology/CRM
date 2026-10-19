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
import { ConsumidorDeChanges } from './interface/consumidor-de-changes.js';
import { PlanificadorDeBarrido } from './interface/planificador-de-barrido.js';

@Module({
  providers: [
    PrismaWebhookService,
    ProcesarChange,
    ConsumidorDeChanges,
    BarrerPendientes,
    PlanificadorDeBarrido,
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
  ],
})
export class InboxWorkerModule {}
