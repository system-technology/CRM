/**
 * La cola de correo DENTRO del proceso, modo `unico` (ADR-0019 §1.2). Sin Redis ni trabajador.
 *
 * Envía por el puerto de correo con cinco intentos y espera exponencial desde 5 s (los mismos
 * números que BullMQ), no reintenta un error definitivo del proveedor (un 4xx) y deduplica por
 * clave de idempotencia: pedir dos veces lo mismo no envía dos (R5).
 *
 * **No es durable, y está aceptado** (ADR-0019 §3, punto 4): si el proceso reinicia, el correo que
 * esperaba su reintento se pierde. OTP e invitaciones se piden de nuevo con un clic y el OTP caduca
 * en minutos. A cambio, el mensaje, que lleva un secreto que no se puede reconstruir (en la base
 * solo está su hash), no sale nunca de la memoria del proceso. Si esto deja de ser aceptable, la
 * alternativa es una tabla sellada y global con su excepción RLS (ADR-0019 §8).
 *
 * R10: ni el destinatario ni el texto llegan al registro. Solo la clase del error, el código del
 * proveedor y el comienzo de la clave.
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  type MensajeDeCorreo,
  PuertoColaDeCorreo,
} from '../../../shared/puertos/puerto-de-correo.js';
import { ColaEnProceso } from '../../../shared/cola-en-proceso/cola-en-proceso.js';
import { ErrorDeCorreo, ErrorDeCorreoDefinitivo } from '../domain/errores-de-correo.js';
import type { PuertoCorreo } from '../domain/puerto-correo.js';

/** Cuánto se recuerda un correo ya enviado para no repetirlo si lo piden de nuevo. */
const RECORDAR_ENVIADOS_MS = 15 * 60_000;

@Injectable()
export class ColaDeCorreoEnProceso extends PuertoColaDeCorreo implements OnModuleDestroy {
  private readonly log = new Logger(ColaDeCorreoEnProceso.name);
  private readonly cola: ColaEnProceso<MensajeDeCorreo>;

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con el puerto elegido. */
  constructor(
    correo: PuertoCorreo,
    opciones: { esperaBaseMs?: number; concurrencia?: number; intentos?: number } = {},
  ) {
    super();
    this.log.warn(
      'Cola de correo en proceso: sin Redis. El correo que espere un reintento se pierde si el proceso reinicia.',
    );
    this.cola = new ColaEnProceso<MensajeDeCorreo>(
      {
        concurrencia: 5,
        intentos: 5,
        esperaBaseMs: 5_000,
        ...opciones,
        esDefinitivo: (error) => error instanceof ErrorDeCorreoDefinitivo,
        recordarExitosMs: RECORDAR_ENVIADOS_MS,
        alFallar: (clave, contexto, error) => {
          const clase = error instanceof Error ? error.constructor.name : 'Error';
          const codigo = error instanceof ErrorDeCorreo ? error.codigo : null;
          this.log.warn(
            `Correo ${clave.slice(0, 8)} falló (intento ${contexto.intento}): ${clase} codigo=${codigo ?? 'n/a'}`,
          );
        },
        alAgotar: (clave) =>
          this.log.error(`Correo ${clave.slice(0, 8)} abandonado: sin más reintentos.`),
      },
      (mensaje) => correo.enviar(mensaje),
    );
  }

  encolar(mensaje: MensajeDeCorreo, claveDeIdempotencia: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]+$/.test(claveDeIdempotencia)) {
      return Promise.reject(new Error('La clave de idempotencia solo admite [A-Za-z0-9_-].'));
    }
    // No espera al envío, igual que el `add` de BullMQ: el llamador no depende del proveedor.
    this.cola.encolar(claveDeIdempotencia, mensaje);
    return Promise.resolve();
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola.cerrar();
  }
}
