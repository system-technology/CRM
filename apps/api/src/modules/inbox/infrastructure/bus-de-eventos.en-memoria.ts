/**
 * El bus de eventos dentro de un solo proceso: pruebas y desarrollo sin Redis.
 *
 * Se elige explícitamente (`BUS_DE_EVENTOS=memoria`) y avisa al construirse; no es un respaldo
 * silencioso. En producción los eventos viajan por Redis (`bus-de-eventos.redis.ts`).
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  type ManejadorDeEvento,
  PuertoPublicadorDeEventos,
  PuertoSuscriptorDeEventos,
} from '../application/puertos-de-eventos.js';
import { EventoDeDominio } from '../domain/evento-de-dominio.js';

@Injectable()
export class BusDeEventosEnMemoria extends PuertoPublicadorDeEventos {
  private readonly manejadores: ManejadorDeEvento[] = [];

  constructor() {
    super();
    new Logger(BusDeEventosEnMemoria.name).warn(
      'Bus de eventos en memoria: solo llega a este proceso (sin Redis).',
    );
  }

  async publicar(evento: EventoDeDominio): Promise<void> {
    // Mismo contrato que por Redis: lo que no lo cumple no sale.
    const valido = EventoDeDominio.parse(evento);
    for (const m of this.manejadores) await m(valido);
  }

  /** La cara de suscripción: una instancia distinta con el mismo estado. */
  suscriptor(): PuertoSuscriptorDeEventos {
    const manejadores = this.manejadores;
    return new (class extends PuertoSuscriptorDeEventos {
      suscribir(manejador: ManejadorDeEvento): Promise<void> {
        manejadores.push(manejador);
        return Promise.resolve();
      }
    })();
  }
}
