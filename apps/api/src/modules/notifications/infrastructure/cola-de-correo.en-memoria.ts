/**
 * «Cola» para pruebas y CI sin trabajador: entrega al instante por el puerto de correo.
 *
 * Se elige explícitamente (`COLA_CORREO=memoria`) y deja un aviso al construirse; no es un
 * respaldo silencioso. Deduplica por clave de idempotencia, igual que BullMQ con `jobId`.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  type MensajeDeCorreo,
  PuertoColaDeCorreo,
} from '../../../shared/puertos/puerto-de-correo.js';
import type { PuertoCorreo } from '../domain/puerto-correo.js';

@Injectable()
export class ColaDeCorreoEnMemoria extends PuertoColaDeCorreo {
  private readonly vistas = new Set<string>();

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con el puerto elegido. */
  constructor(private readonly correo: PuertoCorreo) {
    super();
    new Logger(ColaDeCorreoEnMemoria.name).warn(
      'Cola de correo en memoria: los mensajes se entregan al instante, sin Redis ni trabajador.',
    );
  }

  async encolar(mensaje: MensajeDeCorreo, claveDeIdempotencia: string): Promise<void> {
    if (this.vistas.has(claveDeIdempotencia)) return;
    this.vistas.add(claveDeIdempotencia);
    await this.correo.enviar(mensaje);
  }
}
