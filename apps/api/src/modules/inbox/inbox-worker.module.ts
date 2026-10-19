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
import { ConsumidorDeChanges } from './interface/consumidor-de-changes.js';

@Module({
  providers: [
    PrismaWebhookService,
    ProcesarChange,
    ConsumidorDeChanges,
    { provide: PuertoStaging, useClass: StagingPrisma },
    { provide: PuertoBandeja, useClass: BandejaPrisma },
  ],
})
export class InboxWorkerModule {}
