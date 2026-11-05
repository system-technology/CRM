/**
 * El arranque del modo `unico` (ADR-0019 §1.1): un proceso, dos contextos de Nest, cero Redis.
 *
 * Orden: primero el TRABAJADOR (verifica el rol `viajapro_webhook`, conecta los consumidores a las
 * colas y lanza el barrido de recuperación), después la API. Si cualquiera falla, no se queda un
 * proceso a medias: se cierra lo que ya estaba arriba y se relanza el error.
 *
 * Cierre: primero la API (deja de aceptar webhooks y peticiones) y después el trabajador (termina
 * lo que está en curso y suelta su pool). El orden importa y por eso los dos contextos NO usan
 * `enableShutdownHooks`: cerrarían a la vez.
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configurarApi } from '../configurar-api.js';
import { crearCompartidoDelInbox } from '../modules/inbox/infrastructure/compartido-en-proceso.js';
import { leerModoDeDespliegue } from '../shared/despliegue/modo-de-despliegue.js';
import { ApiUnicoModule, TrabajadorUnicoModule } from './proceso-unico.module.js';

export interface ProcesoUnico {
  api: INestApplication;
  trabajador: INestApplicationContext;
  puerto: number;
  /** Cierre ordenado. Idempotente. */
  cerrar(): Promise<void>;
}

type Entorno = Record<string, string | undefined>;

export class ModoEquivocadoError extends Error {
  constructor() {
    super("main-unico.ts exige MODO_DESPLIEGUE=unico. Para 'escalado' usa main.ts y worker.ts.");
    this.name = 'ModoEquivocadoError';
  }
}

export async function arrancarUnico(entorno: Entorno = process.env): Promise<ProcesoUnico> {
  // Antes de construir nada: sin variable, o con otro valor, no se arranca.
  if (leerModoDeDespliegue(entorno) !== 'unico') throw new ModoEquivocadoError();

  const compartido = crearCompartidoDelInbox();
  const log = new Logger('arranque');

  const trabajador = await NestFactory.createApplicationContext(
    TrabajadorUnicoModule.forRoot(compartido),
    { bufferLogs: true },
  );

  const puerto = Number(entorno['API_PORT'] ?? 3333);
  let api: NestExpressApplication;
  try {
    api = await NestFactory.create<NestExpressApplication>(ApiUnicoModule.forRoot(compartido), {
      bufferLogs: true,
    });
    configurarApi(api);
    await api.listen(puerto);
  } catch (error) {
    await trabajador.close();
    throw error;
  }

  let cerrando: Promise<void> | null = null;
  const cerrar = (): Promise<void> => {
    cerrando ??= (async () => {
      await api.close();
      await trabajador.close();
    })();
    return cerrando;
  };

  log.log(`API y trabajador en un solo proceso (modo unico) en http://localhost:${puerto}`);
  log.log(`Salud: http://localhost:${puerto}/salud/listo`);
  return { api, trabajador, puerto, cerrar };
}
