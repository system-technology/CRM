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
import { LatidoDelTrabajador } from './shared/salud/latido-del-trabajador.js';
import { WorkerModule } from './worker.module.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();
  const log = new Logger('Worker');
  // T-194: latido en Redis que lee `/salud/listo` de la API (el trabajador no sirve HTTP).
  const url = process.env['REDIS_URL'];
  if (url) {
    const latido = new LatidoDelTrabajador(url, (m) => log.warn(m));
    await latido.iniciar();
    process.once('SIGTERM', () => void latido.detener());
    process.once('SIGINT', () => void latido.detener());
  }
  log.log('Trabajador del inbox en marcha.');
}

arrancar().catch((error: unknown) => {
  // Un trabajador que no puede arrancar (rol equivocado, secreto ausente) debe morir ruidoso.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
