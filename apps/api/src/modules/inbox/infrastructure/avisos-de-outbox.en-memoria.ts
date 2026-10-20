import { Injectable } from '@nestjs/common';
import { PuertoAvisoDeOutbox } from '../application/puertos-de-eventos.js';

/**
 * Las pistas del relay, dentro del proceso trabajador. Una pista perdida no pierde ningún evento:
 * el barrido periódico lo encuentra en el outbox.
 */
@Injectable()
export class AvisosDeOutboxEnMemoria extends PuertoAvisoDeOutbox {
  private readonly pendientes = new Set<string>();

  avisar(tenantId: string): void {
    this.pendientes.add(tenantId);
  }

  tomarAvisos(): string[] {
    const tomados = [...this.pendientes];
    this.pendientes.clear();
    return tomados;
  }
}
