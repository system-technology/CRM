import { Logger } from '@nestjs/common';
import {
  type AlmacenDeContadores,
  AlmacenDeContadoresEnMemoria,
  AlmacenDeContadoresRedis,
} from './almacen.js';
import { leerPoliticaDeLimiteDeTasa, type PoliticaDeLimiteDeTasa } from './politica.js';

type Entorno = Record<string, string | undefined>;

/** Lee y valida la política: lanza al arrancar si la configuración es inválida. */
export function crearPoliticaDeLimiteDeTasa(
  entorno: Entorno = process.env,
): PoliticaDeLimiteDeTasa {
  const politica = leerPoliticaDeLimiteDeTasa(entorno);
  if (!politica.activo) {
    new Logger('LimiteDeTasa').warn(
      'LIMITE_TASA_ACTIVO=false: la API NO tiene límite de tasa. Solo para depuración local.',
    );
  }
  return politica;
}

export function crearAlmacenDeLimiteDeTasa(
  politica: PoliticaDeLimiteDeTasa,
  entorno: Entorno = process.env,
): AlmacenDeContadores {
  const url = entorno['REDIS_URL']?.trim();
  if (politica.almacen === 'redis' && url) return AlmacenDeContadoresRedis.desdeUrl(url);
  return new AlmacenDeContadoresEnMemoria();
}
