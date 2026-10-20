/**
 * Elige el bus de eventos según `BUS_DE_EVENTOS`, y lo hace al INSTANCIAR (no al importar), para que
 * una prueba pueda fijar la variable antes de crear la aplicación.
 *
 *   memoria  un solo proceso, sin Redis (pruebas y desarrollo suelto)
 *   (vacío)  Redis pub/sub, con `REDIS_URL`
 *
 * Sin respaldo silencioso: si no se pide memoria y falta `REDIS_URL`, no se arranca.
 */
import { Injectable } from '@nestjs/common';
import {
  PuertoPublicadorDeEventos,
  type PuertoSuscriptorDeEventos,
} from '../application/puertos-de-eventos.js';
import type { EventoDeDominio } from '../domain/evento-de-dominio.js';
import { BusDeEventosEnMemoria } from './bus-de-eventos.en-memoria.js';
import { PublicadorRedis, SuscriptorRedis } from './bus-de-eventos.redis.js';

export const BUS_EN_MEMORIA = Symbol('BUS_DE_EVENTOS_EN_MEMORIA');

const enMemoria = (): boolean => process.env['BUS_DE_EVENTOS'] === 'memoria';

function urlDeRedis(): string {
  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('Falta REDIS_URL (o BUS_DE_EVENTOS=memoria en pruebas).');
  return url;
}

export function crearBusEnMemoriaSiSePide(): BusDeEventosEnMemoria | null {
  return enMemoria() ? new BusDeEventosEnMemoria() : null;
}

export function crearSuscriptor(bus: BusDeEventosEnMemoria | null): PuertoSuscriptorDeEventos {
  return bus ? bus.suscriptor() : new SuscriptorRedis(urlDeRedis());
}

/** La API no publica eventos: solo los recibe. Si algo intenta publicar, es un defecto. */
@Injectable()
export class SinPublicador extends PuertoPublicadorDeEventos {
  publicar(_evento: EventoDeDominio): Promise<void> {
    return Promise.reject(new Error('Este proceso no publica eventos: lo hace el trabajador.'));
  }
}

export function crearPublicadorDeLaApi(
  bus: BusDeEventosEnMemoria | null,
): PuertoPublicadorDeEventos {
  return bus ?? new SinPublicador();
}

/** El trabajador SIEMPRE publica por Redis: es la razón de que el bus exista. */
export function crearPublicadorDelTrabajador(): PuertoPublicadorDeEventos {
  return new PublicadorRedis(urlDeRedis());
}
