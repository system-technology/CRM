/**
 * Caso de uso: crear una oportunidad (T-075), sobre un contacto o desde una conversación.
 *
 * **«Ligada a una conversación»**: hoy no existe una columna que enlace oportunidad y
 * conversación; el vínculo es el CONTACTO (una conversación es de un contacto y una oportunidad
 * también, y la ficha del panel lateral ya muestra «la oportunidad viva del contacto»). Se
 * resuelve el contacto desde la conversación, a través del puerto de `inbox` (R4) que aplica la
 * visibilidad: quien no ve la conversación no puede abrir una oportunidad desde ella.
 *
 * Nace en la etapa inicial del embudo de ESTA agencia, nunca en la que mande el cliente, y queda
 * asignada a quien la crea si no se dice otra cosa: una oportunidad sin dueño es una que nadie
 * seguirá.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  CrearOportunidad,
  CrearOportunidadDeConversacion,
  Oportunidad,
} from '@viajapro/contracts';
import { Money } from '@viajapro/domain';
import { PuertoConversacionesVisibles } from '../../../shared/puertos/puertos-hacia-inbox.js';
import {
  AsesorNoEncontradoError,
  ContactoNoEncontradoError,
  ConversacionNoEncontradaError,
  PaqueteNoEncontradoError,
  SinEtapaInicialError,
} from '../domain/errors.js';
import { PuertoEscrituraCrm } from './puerto-escritura-crm.js';

@Injectable()
export class CrearOportunidadUseCase {
  constructor(
    @Inject(PuertoEscrituraCrm) private readonly escritura: PuertoEscrituraCrm,
    @Inject(PuertoConversacionesVisibles)
    private readonly conversaciones: PuertoConversacionesVisibles,
  ) {}

  async paraContacto(entrada: CrearOportunidad, actorId: string | null): Promise<Oportunidad> {
    if (!(await this.escritura.existeContacto(entrada.contactoId))) {
      throw new ContactoNoEncontradoError(entrada.contactoId);
    }
    return this.crear(entrada.contactoId, entrada, actorId);
  }

  async paraConversacion(
    conversacionId: string,
    entrada: CrearOportunidadDeConversacion,
    actorId: string | null,
  ): Promise<Oportunidad> {
    const conversacion = await this.conversaciones.resolver(conversacionId);
    if (!conversacion) throw new ConversacionNoEncontradaError(conversacionId);
    // Sin `asesorId` explícito, la oportunidad hereda al asesor de la conversación si lo tiene.
    return this.crear(
      conversacion.contactoId,
      { ...entrada, asesorId: entrada.asesorId ?? conversacion.asignadoAId ?? undefined },
      actorId,
    );
  }

  private async crear(
    contactoId: string,
    e: CrearOportunidadDeConversacion,
    actorId: string | null,
  ): Promise<Oportunidad> {
    const asesorId = e.asesorId ?? actorId;
    if (asesorId && !(await this.escritura.existeAsesor(asesorId))) {
      throw new AsesorNoEncontradoError(asesorId);
    }
    if (e.paqueteId && !(await this.escritura.existePaquete(e.paqueteId))) {
      throw new PaqueteNoEncontradoError(e.paqueteId);
    }
    // R8: valida moneda e importe con el value object antes de tocar la base.
    const valor = e.valorEstimado
      ? Money.desdeUnidades(BigInt(e.valorEstimado.unidades), e.valorEstimado.moneda)
      : null;

    const etapa = await this.escritura.etapaInicial();
    if (!etapa) throw new SinEtapaInicialError();

    return this.escritura.crearOportunidad({
      contactoId,
      etapaId: etapa.id,
      titulo: e.titulo,
      destino: e.destino ?? null,
      paqueteId: e.paqueteId ?? null,
      fechaSalida: e.fechaSalida ?? null,
      valorEstimado: valor ? { unidades: valor.unidades.toString(), moneda: valor.moneda } : null,
      asesorId,
      creadoPorId: actorId,
    });
  }
}
