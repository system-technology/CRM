/**
 * Arranca la API como lo hace `main.ts` (NestFactory + `configurarApi`) y envía JSON de verdad.
 * Las pruebas e2e no llaman a `configurarApi`, por eso H-2 (T-126) pasó el CI: montar el analizador
 * de importaciones hacía que Nest omitiera el suyo y TODA ruta JSON recibiera `req.body` vacío.
 */
import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configurarApi } from './configurar-api.js';

@Controller('eco')
class EcoController {
  @Post()
  eco(@Body() cuerpo: unknown): { cuerpo: unknown } {
    return { cuerpo };
  }
}

@Controller('api/v1/catalogo/importaciones')
class EcoImportacionesController {
  @Post()
  eco(@Body() cuerpo: unknown): { cuerpo: unknown } {
    return { cuerpo };
  }
}

@Module({ controllers: [EcoController, EcoImportacionesController] })
class EcoModule {}

describe('configurarApi: cuerpo JSON', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(EcoModule, { logger: false });
    configurarApi(app);
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app.close();
  });

  const enviar = (ruta: string, cuerpo: string): Promise<Response> =>
    fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: cuerpo,
    });

  it('una ruta cualquiera recibe el cuerpo JSON', async () => {
    const r = await enviar('/eco', '{"correo":"a@b.test"}');
    expect(await r.json()).toEqual({ cuerpo: { correo: 'a@b.test' } });
  });

  it('la ruta de importaciones también', async () => {
    const r = await enviar('/api/v1/catalogo/importaciones', '{"a":1}');
    expect(await r.json()).toEqual({ cuerpo: { a: 1 } });
  });
});
