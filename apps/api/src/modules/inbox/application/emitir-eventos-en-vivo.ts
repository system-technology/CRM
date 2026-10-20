/**
 * Traduce un evento de dominio (que llega por el bus) a lo que reciben los sockets.
 *
 * **Lo que se emite es el contrato `EventoBandeja`, validado antes de salir**, armado con lo que se
 * lee de la base bajo RLS con el tenant DEL EVENTO. Nada del cuerpo del evento llega al cliente tal
 * cual, y nada de otra agencia puede colarse: si el mensaje no existe en ese tenant, no se emite.
 * No hay neto ni margen en ningún campo de `Mensaje`.
 *
 * Un tipo de evento que no se conoce se ignora: otros contextos publican por el mismo canal.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventoBandeja } from '@viajapro/contracts';
import {
  CargaDeAccesoRevocado,
  type EventoDeDominio,
  TIPO_ACCESO_REVOCADO,
  TIPO_MENSAJE_RECIBIDO,
} from '../domain/evento-de-dominio.js';
import { PuertoEmisionEnVivo, PuertoLecturaDeMensajes } from './puertos-de-eventos.js';

@Injectable()
export class EmitirEventosEnVivo {
  private readonly log = new Logger(EmitirEventosEnVivo.name);

  constructor(
    @Inject(PuertoLecturaDeMensajes) private readonly lectura: PuertoLecturaDeMensajes,
    @Inject(PuertoEmisionEnVivo) private readonly emision: PuertoEmisionEnVivo,
  ) {}

  async atender(evento: EventoDeDominio): Promise<void> {
    if (evento.tipo === TIPO_MENSAJE_RECIBIDO) {
      const mensaje = await this.lectura.mensajePorId(evento.tenantId, evento.agregadoId);
      if (!mensaje) {
        this.log.warn('Evento de mensaje sin mensaje en su tenant: no se emite.');
        return;
      }
      const salida = EventoBandeja.parse({
        tipo: 'MENSAJE_NUEVO',
        conversacionId: mensaje.conversacionId,
        mensaje,
      });
      this.emision.emitirATenant(evento.tenantId, salida);
      return;
    }

    if (evento.tipo === TIPO_ACCESO_REVOCADO) {
      const carga = CargaDeAccesoRevocado.safeParse(evento.payload);
      if (carga.success) this.emision.desconectarUsuario(evento.tenantId, carga.data.usuarioId);
    }
  }
}
