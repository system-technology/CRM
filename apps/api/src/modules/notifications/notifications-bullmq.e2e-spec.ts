/**
 * La cola de correo con BullMQ REAL: productor -> Redis -> consumidor -> puerto de correo.
 *
 * Afirma: un trabajo por clave de idempotencia (R5), el mensaje llega por el puerto, y al
 * completarse el trabajo se BORRA de Redis (lleva un token o un código: no debe quedarse ahí).
 *
 * Solo corre con `CI=true` (el job levanta Redis 7) o `PRUEBA_BULLMQ=1` y un `REDIS_URL`
 * desechable; en local sin Redis se salta y lo dice.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ColaDeCorreoBullmq,
  crearConexionDeRedis,
} from './infrastructure/cola-de-correo.bullmq.js';
import { CorreoEnMemoria } from './infrastructure/correo.en-memoria.js';
import { ConsumidorDeCorreo } from './interface/consumidor-de-correo.js';

const URL_REDIS = process.env['REDIS_URL'] ?? '';
const CORRE =
  (process.env['CI'] === 'true' || process.env['PRUEBA_BULLMQ'] === '1') && URL_REDIS !== '';

if (!CORRE) {
  console.warn(
    '[notifications-bullmq.e2e] SALTADA: necesita Redis real. Corre con CI=true o con ' +
      'PRUEBA_BULLMQ=1 y REDIS_URL apuntando a un Redis desechable.',
  );
}

const CLAVE = randomBytes(32);
const NOMBRE = `correo-saliente-prueba-${randomUUID()}`;
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!CORRE)('cola de correo con Redis real', () => {
  let productor: ColaDeCorreoBullmq;
  let consumidor: ConsumidorDeCorreo;
  let correo: CorreoEnMemoria;
  let inspector: Queue;
  let conexion: ReturnType<typeof crearConexionDeRedis>;

  beforeAll(() => {
    productor = new ColaDeCorreoBullmq(URL_REDIS, CLAVE, NOMBRE);
    correo = new CorreoEnMemoria();
    consumidor = new ConsumidorDeCorreo(correo);
    consumidor.nombreDeCola = NOMBRE;
    consumidor.clave = CLAVE;
    conexion = crearConexionDeRedis(URL_REDIS);
    inspector = new Queue(NOMBRE, { connection: conexion });
  });

  afterAll(async () => {
    await consumidor?.onModuleDestroy();
    await inspector?.obliterate({ force: true });
    await inspector?.close();
    await conexion?.quit();
    await productor?.onModuleDestroy();
  });

  it('un trabajo por clave, entregado por el puerto y borrado al completarse', async () => {
    const mensaje = { para: 'cola@fixture.test', asunto: 'Código', texto: 'Tu código es 654321' };
    await productor.encolar(mensaje, 'prueba-uno');
    await productor.encolar(mensaje, 'prueba-uno'); // reintento: no duplica

    const guardado = await inspector.getJob('prueba-uno');
    expect(guardado).toBeTruthy();
    // En Redis va CIFRADO: ni el código ni el destinatario aparecen.
    expect(JSON.stringify(guardado?.data)).not.toContain('654321');
    expect(JSON.stringify(guardado?.data)).not.toContain('cola@fixture.test');
    consumidor.onModuleInit();

    for (let i = 0; i < 50 && correo.enviados.length === 0; i += 1) await dormir(100);
    await dormir(300);
    expect(correo.enviados).toEqual([mensaje]);
    // Completado: el secreto ya no está en Redis.
    expect(await inspector.getJob('prueba-uno')).toBeFalsy();
  });

  it('una clave con caracteres no permitidos se rechaza', async () => {
    await expect(
      productor.encolar({ para: 'a@b.test', asunto: 'x', texto: 'y' }, 'a:b'),
    ).rejects.toThrow();
  });
});
