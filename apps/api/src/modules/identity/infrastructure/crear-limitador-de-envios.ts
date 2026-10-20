import type { LimitadorDeEnvios } from '../application/limitador-de-envios.js';
import { LimitadorDeEnviosEnMemoria } from './limitador-de-envios.en-memoria.js';
import { LimitadorDeEnviosRedis } from './limitador-de-envios.redis.js';

/** `LIMITADOR_OTP=memoria` en pruebas; si no, Redis. Sin respaldo silencioso. */
export function crearLimitadorDeEnvios(): LimitadorDeEnvios {
  if (process.env['LIMITADOR_OTP'] === 'memoria') return new LimitadorDeEnviosEnMemoria();
  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('Falta REDIS_URL (o LIMITADOR_OTP=memoria en pruebas).');
  return LimitadorDeEnviosRedis.desdeUrl(url);
}
