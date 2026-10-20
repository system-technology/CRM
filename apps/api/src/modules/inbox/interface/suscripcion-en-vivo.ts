/**
 * Conecta el bus de eventos con los sockets de ESTA réplica: al arrancar la API, se suscribe y
 * entrega cada evento a `EmitirEventosEnVivo`. Sin Redis la suscripción es del bus en memoria.
 */
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EmitirEventosEnVivo } from '../application/emitir-eventos-en-vivo.js';
import { PuertoSuscriptorDeEventos } from '../application/puertos-de-eventos.js';

@Injectable()
export class SuscripcionEnVivo implements OnApplicationBootstrap {
  constructor(
    @Inject(PuertoSuscriptorDeEventos) private readonly bus: PuertoSuscriptorDeEventos,
    @Inject(EmitirEventosEnVivo) private readonly emitir: EmitirEventosEnVivo,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.suscribir((evento) => this.emitir.atender(evento));
  }
}
