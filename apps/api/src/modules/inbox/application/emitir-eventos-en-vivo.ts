/**
 * Traduce un evento de dominio (que llega por el bus) a lo que reciben los sockets.
 *
 * **Lo que se emite es el contrato `EventoBandeja`, validado antes de salir**, armado con lo que se
 * lee de la base bajo RLS con el tenant DEL EVENTO. Nada del cuerpo del evento llega al cliente tal
 * cual, y nada de otra agencia puede colarse: si el mensaje no existe en ese tenant, no se emite.
 * No hay neto ni margen en ningún campo de `Mensaje`.
 *
 * **A quién se emite** (`docs/01-producto/12-visibilidad-de-conversaciones.md`). Cada evento de una
 * conversación sale solo hacia los miembros que la ven, y se calcula EN EL MOMENTO de emitir, con la
 * asignación y los permisos de ese instante:
 *   · un mensaje nuevo, a quien ve la conversación;
 *   · un cambio de asignación o de estado, a quien la ve ahora (`CONVERSACION_ACTUALIZADA`) y, a
 *     quien la veía antes y ya no, un `CONVERSACION_RETIRADA` para que su bandeja quite la fila.
 * El gateway no decide nada: recibe el conjunto de usuarios y emite a sus salas.
 *
 * Un tipo de evento que no se conoce se ignora: otros contextos publican por el mismo canal.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventoBandeja } from '@viajapro/contracts';
import { quienesVen } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import {
  CargaDeAccesoRevocado,
  CargaDeConversacionActualizada,
  type EventoDeDominio,
  TIPO_ACCESO_REVOCADO,
  TIPO_CONVERSACION_ACTUALIZADA,
  TIPO_MENSAJE_ACTUALIZADO,
  TIPO_MENSAJE_RECIBIDO,
  TIPO_MENSAJE_SALIENTE_CREADO,
} from '../domain/evento-de-dominio.js';
import {
  PuertoEmisionEnVivo,
  PuertoLecturaDeConversaciones,
  PuertoLecturaDeMensajes,
} from './puertos-de-eventos.js';

@Injectable()
export class EmitirEventosEnVivo {
  private readonly log = new Logger(EmitirEventosEnVivo.name);

  constructor(
    @Inject(PuertoLecturaDeMensajes) private readonly lectura: PuertoLecturaDeMensajes,
    @Inject(PuertoLecturaDeConversaciones)
    private readonly conversaciones: PuertoLecturaDeConversaciones,
    @Inject(PuertoEmisionEnVivo) private readonly emision: PuertoEmisionEnVivo,
  ) {}

  async atender(evento: EventoDeDominio): Promise<void> {
    if (evento.tipo === TIPO_MENSAJE_RECIBIDO || evento.tipo === TIPO_MENSAJE_SALIENTE_CREADO) {
      await this.mensajeNuevo(evento);
      return;
    }

    if (evento.tipo === TIPO_MENSAJE_ACTUALIZADO) {
      await this.mensajeActualizado(evento);
      return;
    }

    if (evento.tipo === TIPO_CONVERSACION_ACTUALIZADA) {
      await this.conversacionActualizada(evento);
      return;
    }

    if (evento.tipo === TIPO_ACCESO_REVOCADO) {
      const carga = CargaDeAccesoRevocado.safeParse(evento.payload);
      if (carga.success) this.emision.desconectarUsuario(evento.tenantId, carga.data.usuarioId);
    }
  }

  private async mensajeNuevo(evento: EventoDeDominio): Promise<void> {
    const mensaje = await this.lectura.mensajePorId(evento.tenantId, evento.agregadoId);
    if (!mensaje) {
      this.log.warn('Evento de mensaje sin mensaje en su tenant: no se emite.');
      return;
    }
    const asignacion = await this.conversaciones.asignacionDe(
      evento.tenantId,
      mensaje.conversacionId,
    );
    if (!asignacion) return;

    const audiencia = quienesVen(
      await this.conversaciones.miembrosActivos(evento.tenantId),
      asignacion.asignadoAId,
    );
    const salida = EventoBandeja.parse({
      tipo: 'MENSAJE_NUEVO',
      conversacionId: mensaje.conversacionId,
      mensaje,
    });
    this.emision.emitirAUsuarios(evento.tenantId, audiencia, salida);
  }

  /** El estado de entrega cambió (ADR-0018): solo el estado y el motivo, leídos de la base. */
  private async mensajeActualizado(evento: EventoDeDominio): Promise<void> {
    const mensaje = await this.lectura.mensajePorId(evento.tenantId, evento.agregadoId);
    if (!mensaje) {
      this.log.warn('Evento de mensaje sin mensaje en su tenant: no se emite.');
      return;
    }
    const asignacion = await this.conversaciones.asignacionDe(
      evento.tenantId,
      mensaje.conversacionId,
    );
    if (!asignacion) return;

    const audiencia = quienesVen(
      await this.conversaciones.miembrosActivos(evento.tenantId),
      asignacion.asignadoAId,
    );
    this.emision.emitirAUsuarios(
      evento.tenantId,
      audiencia,
      EventoBandeja.parse({
        tipo: 'MENSAJE_ACTUALIZADO',
        conversacionId: mensaje.conversacionId,
        mensajeId: mensaje.id,
        estado: mensaje.estado,
        motivoFallo: mensaje.motivoFallo,
      }),
    );
  }

  private async conversacionActualizada(evento: EventoDeDominio): Promise<void> {
    const carga = CargaDeConversacionActualizada.safeParse(evento.payload);
    const resumen = await this.conversaciones.resumenPorId(evento.tenantId, evento.agregadoId);
    if (!resumen) {
      this.log.warn('Evento de conversación sin conversación en su tenant: no se emite.');
      return;
    }

    const miembros = await this.conversaciones.miembrosActivos(evento.tenantId);
    const ahora = quienesVen(miembros, resumen.asignadoAId);
    this.emision.emitirAUsuarios(
      evento.tenantId,
      ahora,
      EventoBandeja.parse({ tipo: 'CONVERSACION_ACTUALIZADA', conversacion: resumen }),
    );

    // `undefined` = el evento no dice quién la tenía: nadie perdió visibilidad. `null` = estaba
    // sin asignar, es decir, la veían todos.
    const anterior = carga.success ? carga.data.anteriorAsignadoAId : undefined;
    if (anterior === undefined) return;
    const perdieron = new Set([...quienesVen(miembros, anterior)].filter((u) => !ahora.has(u)));
    if (perdieron.size === 0) return;
    this.emision.emitirAUsuarios(
      evento.tenantId,
      perdieron,
      EventoBandeja.parse({ tipo: 'CONVERSACION_RETIRADA', conversacionId: resumen.id }),
    );
  }
}
