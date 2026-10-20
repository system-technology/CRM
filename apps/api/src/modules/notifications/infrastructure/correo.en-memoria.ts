/**
 * El doble del puerto de correo para pruebas y CI: guarda lo que «envió» y no sale a ninguna parte.
 * Se elige explícitamente (`MAIL_PROVIDER=memoria`); no es un respaldo.
 */
import { Injectable } from '@nestjs/common';
import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';
import { PuertoCorreo } from '../domain/puerto-correo.js';

@Injectable()
export class CorreoEnMemoria extends PuertoCorreo {
  readonly enviados: MensajeDeCorreo[] = [];

  enviar(mensaje: MensajeDeCorreo): Promise<void> {
    this.enviados.push(mensaje);
    return Promise.resolve();
  }

  /** Los mensajes para un destinatario, del más viejo al más nuevo. */
  para(correo: string): MensajeDeCorreo[] {
    return this.enviados.filter((m) => m.para.toLowerCase() === correo.toLowerCase());
  }
}
