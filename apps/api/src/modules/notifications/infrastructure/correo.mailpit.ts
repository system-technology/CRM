/**
 * Correo de DESARROLLO: SMTP hacia Mailpit (`pnpm infra:up`; bandeja en http://localhost:8025).
 *
 * Mailpit atrapa todo y no entrega nada: es seguro por construcción. Este adaptador no sirve
 * para producción —no hay TLS ni autenticación— y por eso `crearCorreo` solo lo construye con
 * `MAIL_PROVIDER=mailpit` y se niega si `APP_ENV` no es `local`.
 */
import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';
import { PuertoCorreo } from '../domain/puerto-correo.js';

/** Lo único que se usa de nodemailer: se inyecta para probarlo sin red. */
export interface TransporteSmtp {
  sendMail(opciones: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export function transporteDeMailpit(entorno: Record<string, string | undefined>): TransporteSmtp {
  return createTransport({
    host: entorno['MAIL_SMTP_HOST'] ?? 'localhost',
    port: Number(entorno['MAIL_SMTP_PORT'] ?? 1025),
    secure: false,
    ignoreTLS: true,
  });
}

@Injectable()
export class CorreoMailpit extends PuertoCorreo {
  /** `@inyeccion-manual`: lo construye `crearCorreo`, no el inyector de Nest. */
  constructor(
    private readonly transporte: TransporteSmtp,
    private readonly remitente: string,
  ) {
    super();
  }

  async enviar(mensaje: MensajeDeCorreo): Promise<void> {
    await this.transporte.sendMail({
      from: this.remitente,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
    });
  }
}
