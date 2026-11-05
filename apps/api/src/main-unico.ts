/**
 * Arranque del modo `unico` (ADR-0019): API, Socket.IO, webhook y trabajo asíncrono en UN proceso,
 * sin Redis ni `REDIS_URL`. Exige `MODO_DESPLIEGUE=unico`.
 *
 *   pnpm --filter @viajapro/api dev:unico     desarrollo
 *   node dist/main-unico.js                   producción (con MODO_DESPLIEGUE=unico en el entorno)
 *
 * `main.ts` y `worker.ts` siguen siendo el modo `escalado`.
 */
// DEBE ir primero: ver `main.ts`.
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { arrancarUnico } from './proceso-unico/arrancar-unico.js';

/** Tope para el cierre: si algo no termina, es mejor caer que colgar un despliegue. */
const TOPE_DE_CIERRE_MS = 25_000;

arrancarUnico()
  .then((proceso) => {
    const alRecibirSenal = (senal: string): void => {
      new Logger('arranque').log(`${senal} recibida: cierre ordenado.`);
      const tope = setTimeout(() => process.exit(1), TOPE_DE_CIERRE_MS);
      tope.unref();
      proceso.cerrar().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    };
    process.once('SIGTERM', () => alRecibirSenal('SIGTERM'));
    process.once('SIGINT', () => alRecibirSenal('SIGINT'));
  })
  .catch((error: unknown) => {
    // Rol equivocado, secreto ausente o modo mal puesto: debe morir ruidoso, no a medias.
    new Logger('arranque').error(
      'El proceso unico no pudo arrancar',
      error instanceof Error ? error.stack : error,
    );
    process.exit(1);
  });
