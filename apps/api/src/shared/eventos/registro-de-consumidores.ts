import { Injectable } from '@nestjs/common';
import type { ConsumidorDeEventos } from './consumidor-de-eventos.js';

const FORMA = /^[a-z]+\.[a-z_]+$/;

export class ConsumidorDeEventosInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ConsumidorDeEventosInvalidoError';
  }
}

/**
 * Los consumidores registrados en este proceso. Cada módulo registra el suyo en `onModuleInit`;
 * el planificador los lee en `onApplicationBootstrap`, cuando ya están todos.
 */
@Injectable()
export class RegistroDeConsumidores {
  private readonly porNombre = new Map<string, ConsumidorDeEventos>();

  registrar(consumidor: ConsumidorDeEventos): void {
    // Lo mismo que valida la base y la función SECURITY DEFINER: fallar al arrancar, no al entregar.
    if (!FORMA.test(consumidor.nombre) || !FORMA.test(consumidor.tipoEvento)) {
      throw new ConsumidorDeEventosInvalidoError(
        `El consumidor '${consumidor.nombre}' / evento '${consumidor.tipoEvento}' no tiene la forma contexto.nombre.`,
      );
    }
    if (this.porNombre.has(consumidor.nombre)) {
      throw new ConsumidorDeEventosInvalidoError(
        `El consumidor '${consumidor.nombre}' ya está registrado.`,
      );
    }
    this.porNombre.set(consumidor.nombre, consumidor);
  }

  todos(): readonly ConsumidorDeEventos[] {
    return [...this.porNombre.values()];
  }
}
