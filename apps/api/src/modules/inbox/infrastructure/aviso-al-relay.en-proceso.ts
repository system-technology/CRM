/**
 * La pista API -> relay dentro de UN proceso (modo `unico`, ADR-0019 §1.1): en vez de publicar por
 * Redis, deja el aviso en el mismo almacén en memoria que lee el relay. Sigue siendo solo una
 * pista: el outbox es la verdad, y el barrido de seguridad lo encuentra si el aviso se pierde.
 */
import { Injectable } from '@nestjs/common';
import { PuertoAvisoAlRelay, type PuertoAvisoDeOutbox } from '../application/puertos-de-eventos.js';

@Injectable()
export class AvisoAlRelayEnProceso extends PuertoAvisoAlRelay {
  /** `@inyeccion-manual`: los `avisos` son los compartidos con el relay. */
  constructor(private readonly avisos: PuertoAvisoDeOutbox) {
    super();
  }

  avisar(tenantId: string): Promise<void> {
    this.avisos.avisar(tenantId);
    return Promise.resolve();
  }
}
