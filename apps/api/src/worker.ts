/**
 * Proceso del trabajador del inbox. Se arranca aparte de la API (`pnpm --filter @viajapro/api worker`).
 *
 * **No arranca HTTP**: es un contexto de aplicación de Nest. Y se conecta como `viajapro_webhook`,
 * no como `viajapro_app`: ver `PrismaWebhookService`. La clave de descifrado del staging vive en
 * este proceso y no en el de la API (ADR-0008 §4: el que puede listar no es el que puede
 * descifrar).
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InboxWorkerModule } from './modules/inbox/inbox-worker.module.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(InboxWorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();
  new Logger('Worker').log('Trabajador del inbox en marcha.');
}

arrancar().catch((error: unknown) => {
  // Un trabajador que no puede arrancar (rol equivocado, secreto ausente) debe morir ruidoso.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
