/**
 * Cola que no encola, para entornos sin Redis (desarrollo sin `infra:up`, pruebas e2e).
 *
 * No es un respaldo silencioso: se elige explícitamente con `COLA_CHANGES=inerte` y deja un aviso
 * al construirse. El change queda guardado `PENDIENTE` igual; solo falta quien lo recoja.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PuertoColaDeChanges } from '../application/puertos-de-proceso.js';

@Injectable()
export class ColaDeChangesInerte extends PuertoColaDeChanges {
  constructor() {
    super();
    new Logger(ColaDeChangesInerte.name).warn(
      'Cola inerte: los changes se guardan pero ningún trabajador los recibirá.',
    );
  }

  encolar(): Promise<void> {
    return Promise.resolve();
  }
}
