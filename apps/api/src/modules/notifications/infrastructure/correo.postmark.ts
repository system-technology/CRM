/**
 * Correo de PRODUCCIÓN: Postmark por HTTP con `fetch`, sin SDK (ADR-0012).
 *
 * - `POST https://api.postmarkapp.com/email` con `X-Postmark-Server-Token`.
 * - Sin seguimiento (`TrackOpens: false`, `TrackLinks: "None"`): el enlace de invitación lleva su
 *   token y no debe pasar por un dominio de seguimiento.
 * - Stream transaccional (`outbound` por omisión).
 * - Timeout de 10 s por intento. **Este adaptador no reintenta**: clasifica el fallo y lo lanza;
 *   reintentar es cosa de la cola BullMQ (R5), con el `jobId` como clave natural.
 * - Política de reintento (INFERENCIA, no política oficial de Postmark: su documentación no la
 *   publica): se reintenta red, timeout, 429 y 5xx; nunca un 4xx, tampoco el 422. Un 5xx puede
 *   duplicar si Postmark sí procesó la petición; el duplicado lleva el mismo código o enlace.
 * - Los errores solo llevan `ErrorCode` y estado HTTP; jamás el campo `Message` de Postmark
 *   (puede repetir el destinatario, R10).
 */
import { Injectable } from '@nestjs/common';
import type { MensajeDeCorreo } from '../../../shared/puertos/puerto-de-correo.js';
import { PuertoCorreo } from '../domain/puerto-correo.js';
import { ErrorDeCorreoDefinitivo, ErrorDeCorreoTransitorio } from '../domain/errores-de-correo.js';

export const URL_DE_POSTMARK = 'https://api.postmarkapp.com/email';
export const TIMEOUT_DE_POSTMARK_MS = 10_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface OpcionesDePostmark {
  token: string;
  remitente: string;
  stream: string;
  /** Se inyecta en las pruebas: nunca hay llamadas reales a Postmark en local ni en el CI. */
  fetch?: Fetch;
  timeoutMs?: number;
}

/** Extrae solo el `ErrorCode` numérico; descarta todo lo demás del cuerpo. */
async function leerErrorCode(respuesta: Response): Promise<number | null> {
  try {
    const cuerpo: unknown = await respuesta.json();
    if (typeof cuerpo === 'object' && cuerpo !== null && 'ErrorCode' in cuerpo) {
      const codigo = cuerpo.ErrorCode;
      if (typeof codigo === 'number') return codigo;
    }
  } catch {
    // Cuerpo ausente o no JSON (p. ej. una página de error de un proxy): no hay código que leer.
  }
  return null;
}

@Injectable()
export class CorreoPostmark extends PuertoCorreo {
  private readonly peticion: Fetch;
  private readonly timeoutMs: number;

  /** `@inyeccion-manual`: lo construye `crearCorreo`, no el inyector de Nest. */
  constructor(private readonly opciones: OpcionesDePostmark) {
    super();
    this.peticion = opciones.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opciones.timeoutMs ?? TIMEOUT_DE_POSTMARK_MS;
  }

  async enviar(mensaje: MensajeDeCorreo): Promise<void> {
    let respuesta: Response;
    try {
      respuesta = await this.peticion(URL_DE_POSTMARK, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': this.opciones.token,
        },
        body: JSON.stringify({
          From: this.opciones.remitente,
          To: mensaje.para,
          Subject: mensaje.asunto,
          TextBody: mensaje.texto,
          TrackOpens: false,
          TrackLinks: 'None',
          MessageStream: this.opciones.stream,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Red o timeout. Se descarta el error original: puede citar la URL o el cuerpo.
      throw new ErrorDeCorreoTransitorio(
        'Postmark inalcanzable o sin respuesta a tiempo.',
        null,
        null,
      );
    }

    if (respuesta.ok) return;

    const codigo = await leerErrorCode(respuesta);
    const estado = respuesta.status;
    if (estado === 429 || estado >= 500) {
      throw new ErrorDeCorreoTransitorio(`Postmark respondió ${estado}.`, codigo, estado);
    }
    throw new ErrorDeCorreoDefinitivo(`Postmark rechazó el envío (${estado}).`, codigo, estado);
  }
}
