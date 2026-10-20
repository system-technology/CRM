/**
 * Límite de envíos de código (OTP) contra el Redis REAL. v0.37.1 lo probó solo con un doble del
 * cliente de Redis; esta es la que cruza `INCR` + `EXPIRE NX` de verdad. Afirma:
 *   · por IP: al superar el máximo, 429 `DEMASIADOS_INTENTOS`;
 *   · por correo: al superarlo, 200 `{ok:true}` idéntico y NINGÚN envío más en el puerto de correo;
 *   · la clave en Redis es el HMAC (`claveDeLimite`) y ninguna clave contiene el correo ni la IP;
 *   · cada clave tiene TTL, acotado por la ventana.
 *
 * **Cuándo corre.** Solo con `CI=true` (el job de CI levanta Redis 7) o con `PRUEBA_BULLMQ=1` y un
 * `REDIS_URL` desechable. En local sin Redis se salta avisando por la consola, no en silencio.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { CorreoEnMemoria } from '../notifications/infrastructure/correo.en-memoria.js';
import { claveDeLimite } from './application/limitador-de-envios.js';
import { leerSecretoDeAutenticacion } from './infrastructure/crear-auth.js';

const URL_REDIS = process.env['REDIS_URL'] ?? '';
const CORRE =
  (process.env['CI'] === 'true' || process.env['PRUEBA_BULLMQ'] === '1') && URL_REDIS !== '';

if (!CORRE) {
  console.warn(
    '[limite-otp-redis.e2e] SALTADA: necesita Redis real. Corre con CI=true (el job de CI ' +
      'levanta Redis 7) o con PRUEBA_BULLMQ=1 y REDIS_URL apuntando a un Redis desechable. Las ' +
      'demás pruebas usan LIMITADOR_OTP=memoria.',
  );
}

const ORIGEN_WEB = 'http://localhost:3000';
const MARCA = randomBytes(4).toString('hex');
const CORREO_REAL = `fixture-otp-redis-${MARCA}-real@fixture-identidad.test`;
const correoFantasma = (n: number): string =>
  `fixture-otp-redis-${MARCA}-fantasma${n}@fixture-identidad.test`;
const octeto = (): number => Math.floor(Math.random() * 250) + 1;
const ipNueva = (): string => `10.${octeto()}.${octeto()}.${octeto()}`;
const MAX_IP = 2;
const MAX_CORREO = 3;
const VENTANA = 900;

let app: INestApplication;
let base: string;
let redis: Redis;
let adminPg: Client;
let correoDePrueba: CorreoEnMemoria;
let secreto: string;
const clavesUsadas: string[] = [];
const ipsUsadas: string[] = [];

async function pedirCodigo(correo: string, ip: string) {
  const r = await fetch(new URL('/api/v1/auth/otp/enviar', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEN_WEB, 'x-forwarded-for': ip },
    body: JSON.stringify({ correo }),
  });
  ipsUsadas.push(ip);
  const texto = await r.text();
  return {
    estado: r.status,
    json: (texto ? JSON.parse(texto) : {}) as Record<string, unknown>,
  };
}

/** El envío es asíncrono (cola en memoria): espera a que llegue o se agote la espera. */
async function esperarEnvios(correo: string, esperados: number): Promise<number> {
  for (let i = 0; i < 40; i += 1) {
    if (correoDePrueba.para(correo).length >= esperados) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return correoDePrueba.para(correo).length;
}

describe.skipIf(!CORRE)('límite de OTP con Redis real', () => {
  beforeAll(async () => {
    // `vitest.config.ts` fija el limitador en memoria y límites enormes: aquí se invierte.
    delete process.env['LIMITADOR_OTP'];
    process.env['OTP_ENVIOS_POR_IP'] = String(MAX_IP);
    process.env['OTP_ENVIOS_POR_CORREO'] = String(MAX_CORREO);
    process.env['OTP_VENTANA_SEGUNDOS'] = String(VENTANA);
    secreto = leerSecretoDeAutenticacion(process.env);

    redis = new Redis(URL_REDIS);
    adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
    await adminPg.connect();
    const { rows } = await adminPg.query<{ db: string }>('SELECT current_database() AS db');
    if (rows[0]?.db !== 'neondb')
      throw new Error(`Base inesperada: ${rows[0]?.db}. No se escribe.`);
    await adminPg.query(
      `INSERT INTO identidades (id, correo, nombre, correo_verificado, actualizado_en)
       VALUES (gen_random_uuid(), $1, $2, true, now())`,
      [CORREO_REAL, 'Límite OTP'],
    );

    Logger.overrideLogger(false);
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new DominioExcepcionFilter());
    (app as NestExpressApplication).set('trust proxy', 1);
    await app.listen(0);
    base = await app.getUrl();
    correoDePrueba = app.get(CorreoEnMemoria);
  });

  afterAll(async () => {
    await app?.close();
    if (redis) {
      if (clavesUsadas.length > 0) await redis.del(...clavesUsadas);
      redis.disconnect();
    }
    if (adminPg) {
      await adminPg.query('DELETE FROM identidades WHERE correo = $1::citext', [CORREO_REAL]);
      await adminPg.query('DELETE FROM verificaciones WHERE identificador = $1', [
        `sign-in-otp-${CORREO_REAL}`,
      ]);
      await adminPg.end();
    }
  });

  it('por IP: al superar el máximo responde 429, y el contador llegó a MAX+1 en Redis', async () => {
    const ip = ipNueva();
    const claveIp = claveDeLimite(secreto, 'ip', ip);
    clavesUsadas.push(claveIp);
    for (let n = 1; n <= MAX_IP; n += 1) {
      const r = await pedirCodigo(correoFantasma(n), ip);
      expect(r.estado, `petición ${n}`).toBe(200);
    }
    const excedida = await pedirCodigo(correoFantasma(99), ip);
    expect(excedida.estado).toBe(429);
    expect((excedida.json['error'] as { code: string }).code).toBe('DEMASIADOS_INTENTOS');
    // El rechazo vino de NUESTRO límite (contó MAX+1), no del de Better Auth (que cuenta aparte).
    expect(await redis.get(claveIp)).toBe(String(MAX_IP + 1));
    for (const n of [1, 2, 99]) {
      clavesUsadas.push(claveDeLimite(secreto, 'correo', correoFantasma(n)));
    }
  });

  it('por correo: el cuarto pedido da el mismo 200 y no sale ningún correo más', async () => {
    const claveCorreo = claveDeLimite(secreto, 'correo', CORREO_REAL);
    clavesUsadas.push(claveCorreo);
    // Una IP distinta por petición: aísla el límite por correo del de IP.
    for (let n = 1; n <= MAX_CORREO; n += 1) {
      const ip = ipNueva();
      clavesUsadas.push(claveDeLimite(secreto, 'ip', ip));
      const r = await pedirCodigo(CORREO_REAL, ip);
      expect(r.estado, `petición ${n}`).toBe(200);
      expect(await esperarEnvios(CORREO_REAL, n), `envío ${n}`).toBe(n);
    }
    const ipCuarta = ipNueva();
    clavesUsadas.push(claveDeLimite(secreto, 'ip', ipCuarta));
    const cuarta = await pedirCodigo(CORREO_REAL, ipCuarta);
    expect(cuarta.estado).toBe(200);
    expect(cuarta.json).toEqual({ ok: true });
    // Margen para que un envío indebido, asíncrono, llegara si existiera.
    await new Promise((r) => setTimeout(r, 500));
    expect(correoDePrueba.para(CORREO_REAL)).toHaveLength(MAX_CORREO);
    expect(await redis.get(claveCorreo)).toBe(String(MAX_CORREO + 1));
  });

  it('la clave en Redis es el HMAC, no el correo ni la IP, y tiene TTL', async () => {
    const claves = new Set<string>();
    let cursor = '0';
    do {
      const [siguiente, lote] = await redis.scan(
        cursor,
        'MATCH',
        'viajapro:otp-envio:*',
        'COUNT',
        500,
      );
      cursor = siguiente;
      for (const k of lote) claves.add(k);
    } while (cursor !== '0');

    const claveCorreo = claveDeLimite(secreto, 'correo', CORREO_REAL);
    expect(claves.has(claveCorreo)).toBe(true);
    expect(claveCorreo).toMatch(/^viajapro:otp-envio:correo:[0-9a-f]{64}$/);

    for (const k of claves) {
      expect(k).not.toContain(MARCA);
      expect(k).not.toContain('fixture-identidad');
      for (const ip of ipsUsadas) expect(k).not.toContain(ip);
    }
    for (const k of clavesUsadas) {
      const ttl = await redis.ttl(k);
      expect(ttl, `TTL de ${k}`).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(VENTANA);
    }
  });
});
