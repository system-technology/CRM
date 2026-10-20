/**
 * La raíz del PROCESO trabajador, hermana de AppModule. Compone los módulos que el trabajador
 * necesita y los puertos que cada uno recibe de los demás: es el único sitio donde se conocen.
 * inbox pide un contacto por un puerto; quien lo implementa es crm, y se enchufa aquí.
 */
import { Module } from '@nestjs/common';
import { CrmPuertosModule } from './modules/crm/crm-puertos.module.js';
import { InboxWorkerModule } from './modules/inbox/inbox-worker.module.js';

@Module({ imports: [CrmPuertosModule, InboxWorkerModule] })
export class WorkerModule {}
