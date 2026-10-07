// DEBE ir primero, antes de cualquier otro import.
//
// NestJS resuelve las dependencias del constructor leyendo los metadatos que emite TypeScript
// con `emitDecoratorMetadata`, y esos metadatos no existen sin este polyfill. El síntoma de
// olvidarlo es desconcertante: la aplicación arranca, mapea las rutas, se conecta a la base de
// datos, y al primer uso las dependencias inyectadas son `undefined`.
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DominioExcepcionFilter } from './shared/filtros/dominio-excepcion.filter.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalFilters(new DominioExcepcionFilter());

  // Sin ValidationPipe global: validamos con los esquemas Zod de @viajapro/contracts,
  // uno por ruta. El pipe de Nest exige class-validator y duplicaria la definicion de cada
  // forma de datos — justo lo que la regla R3 evita.

  // Los webhooks de Meta se firman sobre el CUERPO CRUDO: cualquier middleware que parsee
  // JSON antes rompe la verificación de la firma. Es el error número uno de esta integración.
  app.use('/webhooks', (await import('express')).raw({ type: '*/*', limit: '1mb' }));

  app.enableCors({
    origin: process.env['WEB_PUBLIC_URL'] ?? 'http://localhost:3000',
    credentials: true,
  });

  const puerto = Number(process.env['API_PORT'] ?? 3333);
  await app.listen(puerto);

  const log = new Logger('arranque');
  log.log(`API escuchando en http://localhost:${puerto}`);
  log.log(`Salud: http://localhost:${puerto}/salud/listo`);
}

arrancar().catch((error) => {
  // Si el arranque falla —por ejemplo, porque el rol puede saltarse RLS— el proceso NO debe
  // quedarse vivo a medias: es preferible que el despliegue falle de forma visible.
  new Logger('arranque').error(
    'La API no pudo arrancar',
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
});
