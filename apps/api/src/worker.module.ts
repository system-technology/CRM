/**
 * La raíz del PROCESO trabajador, hermana de AppModule. Compone los módulos que el trabajador
 * necesita y los puertos que cada uno recibe de los demás: es el único sitio donde se conocen.
 * inbox pide un contacto por un puerto; quien lo implementa es crm, y se enchufa aquí.
 */
import { Module } from '@nestjs/common';
import { CifradoModule } from './shared/cifrado/cifrado.module.js';
import { comprobacionDeClavesDelTrabajador } from './shared/cifrado/comprobacion-al-arrancar.js';
import { PrismaWebhookService } from './shared/prisma/prisma-webhook.service.js';
import { CrmPuertosModule } from './modules/crm/crm-puertos.module.js';
import { InboxWorkerModule } from './modules/inbox/inbox-worker.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module.js';

// CifradoModule (ADR-0015): el trabajador cifra los entrantes y descifra lo que envía a Meta. Sin la
// clave, no arranca. T-234: la comprobación de claves (datos con versión huérfana) va en la raíz:
// corre tras el rol de `PrismaWebhookService` y antes de que ningún consumidor se conecte.
@Module({
  imports: [CifradoModule, CrmPuertosModule, InboxWorkerModule, NotificationsWorkerModule],
  providers: [comprobacionDeClavesDelTrabajador(PrismaWebhookService)],
})
export class WorkerModule {}
