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
import { MedidorDeCola } from './shared/observabilidad/antiguedad-de-cola.js';
import { LoggerJson } from './shared/observabilidad/logger-json.js';
import { PrismaWebhookService } from './shared/prisma/prisma-webhook.service.js';
import { LatidoDelTrabajador } from './shared/salud/latido-del-trabajador.js';
import { WorkerModule } from './worker.module.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(new LoggerJson());
  app.enableShutdownHooks();
  const log = new Logger('Worker');
  // T-226 (b) / T-234: la comprobación de claves vive en `WorkerModule` y corre dentro de
  // `createApplicationContext`, antes de que los consumidores se conecten (onApplicationBootstrap).
  // T-194: latido en Redis que lee `/salud/listo` de la API (el trabajador no sirve HTTP).
  const url = process.env['REDIS_URL'];
  if (url) {
    const latido = new LatidoDelTrabajador(url, (m) => log.warn(m));
    await latido.iniciar();
    process.once('SIGTERM', () => void latido.detener());
    process.once('SIGINT', () => void latido.detener());
    // T-203: antigüedad del trabajo pendiente más viejo, para `/salud/listo`. Mismo Redis.
    const medidor = new MedidorDeCola(url, app.get(PrismaWebhookService, { strict: false }), (m) =>
      log.warn(m),
    );
    await medidor.iniciar();
    process.once('SIGTERM', () => void medidor.detener());
    process.once('SIGINT', () => void medidor.detener());
  }
  log.log('Trabajador del inbox en marcha.');
}

arrancar().catch((error: unknown) => {
  // Un trabajador que no puede arrancar (rol equivocado, secreto ausente) debe morir ruidoso.
  // Una línea JSON y redactada; sin pila ni URL de conexión.
  new LoggerJson().fatal('El trabajador no pudo arrancar', error, 'Worker');
  process.exit(1);
});
