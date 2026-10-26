/**
 * Dobles del envío para pruebas: nunca hay llamadas a Meta en local ni en el CI (ADR-0018).
 *
 * `EnvioWhatsappFalso` responde lo que se le programe, en orden, y recuerda cada pedido;
 * `ReservaDeEnvioEnMemoria` es la reserva sin Redis.
 */
import type { ErrorDeEnvioWhatsapp } from '../domain/errores-de-envio.js';
import {
  type PedidoDeTexto,
  PuertoEnvioWhatsapp,
  PuertoReservaDeEnvio,
} from '../application/puertos-de-envio.js';

export type RespuestaFalsa = { wamid: string } | ErrorDeEnvioWhatsapp;

export class EnvioWhatsappFalso extends PuertoEnvioWhatsapp {
  readonly pedidos: PedidoDeTexto[] = [];
  private readonly respuestas: RespuestaFalsa[];

  constructor(...respuestas: RespuestaFalsa[]) {
    super();
    this.respuestas = respuestas;
  }

  enviarTexto(pedido: PedidoDeTexto): Promise<{ wamid: string }> {
    this.pedidos.push(pedido);
    const r = this.respuestas.shift() ?? { wamid: `wamid.falso.${this.pedidos.length}` };
    return 'wamid' in r ? Promise.resolve(r) : Promise.reject(r);
  }
}

export class ReservaDeEnvioEnMemoria extends PuertoReservaDeEnvio {
  readonly reservados = new Set<string>();

  reservar(mensajeId: string): Promise<boolean> {
    if (this.reservados.has(mensajeId)) return Promise.resolve(false);
    this.reservados.add(mensajeId);
    return Promise.resolve(true);
  }

  liberar(mensajeId: string): Promise<void> {
    this.reservados.delete(mensajeId);
    return Promise.resolve();
  }
}
