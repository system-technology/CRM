/**
 * Límite de tasa general (T-002) con `AppModule` ensamblado: el middleware global corta con 429 +
 * `Retry-After` antes de resolver la sesión, y `/salud` no se limita. La IP sale de `req.ip` con
 * `trust proxy`, así cada prueba usa una IP propia en `x-forwarded-for`.
 */
import 'reflect-metadata';

import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module.js';
import { DominioExcepcionFilter } from '../../filtros/dominio-excepcion.filter.js';

let app: INestApplication;
let base: string;
const anterior = {
  ip: process.env['LIMITE_TASA_POR_IP'],
  almacen: process.env['LIMITE_TASA_ALMACEN'],
};

beforeAll(async () => {
  process.env['LIMITE_TASA_POR_IP'] = '3';
  process.env['LIMITE_TASA_ALMACEN'] = 'memoria';
  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  for (const [k, v] of [
    ['LIMITE_TASA_POR_IP', anterior.ip],
    ['LIMITE_TASA_ALMACEN', anterior.almacen],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const pedir = (ruta: string, ip: string) =>
  fetch(new URL(ruta, base), { headers: { 'x-forwarded-for': ip } });

describe('límite de tasa de la API (AppModule)', () => {
  it('al superar el umbral por IP responde 429 con Retry-After', async () => {
    const ip = '10.20.30.1';
    for (let i = 0; i < 3; i++) {
      const r = await pedir('/api/v1/clientes', ip);
      expect(r.status).not.toBe(429);
    }
    const r = await pedir('/api/v1/clientes', ip);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    const cuerpo = (await r.json()) as { error: { code: string } };
    expect(cuerpo.error.code).toBe('LIMITE_DE_TASA');
  });

  it('otra IP no se ve afectada', async () => {
    const r = await pedir('/api/v1/clientes', '10.20.30.2');
    expect(r.status).not.toBe(429);
  });

  it('/salud no se limita', async () => {
    for (let i = 0; i < 8; i++) {
      const r = await pedir('/salud', '10.20.30.3');
      expect(r.status).toBe(200);
    }
  });
});
