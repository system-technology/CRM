/**
 * Caso de uso del trabajador: enviar a Meta UN mensaje saliente ya guardado. ADR-0018.
 *
 * El orden es la garantía, y por eso está escrito paso a paso:
 *
 *   1. **Leer** el mensaje bajo RLS, en una transacción que se cierra antes de seguir: nunca hay
 *      red dentro de una transacción (AGENTS.md §5).
 *   2. **¿Ya resuelto?** Si tiene `wamid` o no está `PENDIENTE`, no se hace nada: es un reintento
 *      de BullMQ o un reencolado del relay. Esta es la primera mitad de la idempotencia.
 *   3. **Volver a mirar la ventana y el canal.** Pudieron cerrarse mientras esperaba en la cola;
 *      mejor un fallo nuestro, explicado, que un `131047` de Meta.
 *   4. **Reservar** (`PuertoReservaDeEnvio`) ANTES de llamar. Si la reserva ya existía, un intento
 *      anterior pudo llegar a Meta y murió sin registrar la respuesta: no se reenvía; se marca
 *      «sin confirmar» y el webhook de estado lo corrige si Meta lo aceptó. Segunda mitad.
 *   5. **Llamar a Meta**, fuera de toda transacción.
 *   6. **Registrar** el resultado: `wamid` si lo aceptó; `FALLIDO` con motivo si lo rechazó para
 *      siempre; liberar la reserva y relanzar si el rechazo fue pasajero (la cola reintenta), salvo
 *      en el último intento, donde se marca `FALLIDO`.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { VentanaCerradaError } from '../domain/errores-de-conversacion.js';
import {
  CanalNoActivoError,
  ErrorDeEnvioWhatsapp,
  EnvioRechazadoError,
  EnvioSinConfirmarError,
} from '../domain/errores-de-envio.js';
import { exigirVentanaAbierta } from '../domain/ventana-de-servicio.js';
import { PuertoAvisoDeOutbox } from './puertos-de-eventos.js';
import {
  type CredencialDeEnvio,
  PuertoCredencialesWhatsapp,
  PuertoEnvioWhatsapp,
  PuertoMensajesSalientes,
  PuertoReservaDeEnvio,
} from './puertos-de-envio.js';

export type ResultadoDeEnvio =
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'YA_RESUELTO' }
  | { estado: 'ACEPTADO'; wamid: string }
  | { estado: 'FALLIDO'; codigo: string; codigoMeta: number | null };

@Injectable()
export class EnviarMensajeSaliente {
  private readonly log = new Logger(EnviarMensajeSaliente.name);

  constructor(
    @Inject(PuertoMensajesSalientes) private readonly mensajes: PuertoMensajesSalientes,
    @Inject(PuertoCredencialesWhatsapp) private readonly credenciales: PuertoCredencialesWhatsapp,
    @Inject(PuertoEnvioWhatsapp) private readonly whatsapp: PuertoEnvioWhatsapp,
    @Inject(PuertoReservaDeEnvio) private readonly reservas: PuertoReservaDeEnvio,
    // La pista para el relay: el fallo llega al socket en décimas de segundo. Opcional.
    @Optional() @Inject(PuertoAvisoDeOutbox) private readonly avisos?: PuertoAvisoDeOutbox,
  ) {}

  /**
   * `ultimoIntento`: si la cola ya no volverá a intentarlo. Un fallo pasajero en el último intento
   * se registra como `FALLIDO` en vez de relanzarse, para que el asesor no vea «pendiente» para
   * siempre.
   */
  async ejecutar(
    tenantId: string,
    mensajeId: string,
    ultimoIntento: boolean,
    ahora: Date = new Date(),
  ): Promise<ResultadoDeEnvio> {
    const m = await this.mensajes.leerParaEnviar(tenantId, mensajeId);
    if (!m) return { estado: 'NO_ENCONTRADO' };
    if (m.aceptadoPorMeta || m.estado !== 'PENDIENTE') return { estado: 'YA_RESUELTO' };

    // Mínimo vertical: solo texto. Plantillas, medios e interactivos no salen por aquí todavía.
    if (m.tipo !== 'TEXTO' || !m.texto) {
      return this.fallar(tenantId, mensajeId, new EnvioRechazadoError(null));
    }
    if (!m.canalActivo) return this.fallar(tenantId, mensajeId, new CanalNoActivoError());
    try {
      exigirVentanaAbierta(m.ultimoMensajeClienteEn, ahora);
    } catch (error) {
      if (error instanceof VentanaCerradaError) return this.fallar(tenantId, mensajeId, error);
      throw error;
    }

    let credencial: CredencialDeEnvio;
    try {
      credencial = await this.credenciales.paraCanal(tenantId, {
        canalId: m.canalId,
        phoneNumberId: m.phoneNumberId,
      });
    } catch (error) {
      if (error instanceof ErrorDeEnvioWhatsapp) return this.fallar(tenantId, mensajeId, error);
      throw error;
    }

    if (!(await this.reservas.reservar(mensajeId))) {
      // Un intento anterior pudo llegar a Meta. Reenviar podría duplicarlo: no se reenvía.
      this.log.warn('Reserva de envío ya existente: se marca sin confirmar, sin reenviar.');
      return this.fallar(tenantId, mensajeId, new EnvioSinConfirmarError());
    }

    try {
      const { wamid } = await this.whatsapp.enviarTexto({
        credencial,
        para: m.destinoE164,
        texto: m.texto,
        referencia: mensajeId,
      });
      await this.mensajes.registrarAceptado(tenantId, mensajeId, wamid);
      return { estado: 'ACEPTADO', wamid };
    } catch (error) {
      if (!(error instanceof ErrorDeEnvioWhatsapp)) throw error;
      if (error.reintentable) {
        // Meta respondió que NO lo aceptó: reintentar es seguro, así que se suelta la reserva.
        await this.reservas.liberar(mensajeId);
        if (!ultimoIntento) throw error;
      }
      return this.fallar(tenantId, mensajeId, error);
    }
  }

  private async fallar(
    tenantId: string,
    mensajeId: string,
    error: ErrorDeEnvioWhatsapp | VentanaCerradaError | CanalNoActivoError,
  ): Promise<ResultadoDeEnvio> {
    const codigoMeta = error instanceof ErrorDeEnvioWhatsapp ? error.codigoMeta : null;
    const escrito = await this.mensajes.registrarFallo(tenantId, mensajeId, {
      codigoMeta,
      message: error.message,
    });
    if (escrito) this.avisos?.avisar(tenantId);
    // Solo la clase y el código: ni el texto ni el destinatario (R10), ni nada del token.
    this.log.warn(
      `Envío ${mensajeId} fallido: ${error.code}${codigoMeta ? ` (${codigoMeta})` : ''}.`,
    );
    return { estado: 'FALLIDO', codigo: error.code, codigoMeta };
  }
}
