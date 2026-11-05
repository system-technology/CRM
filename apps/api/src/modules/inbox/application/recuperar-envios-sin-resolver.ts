/**
 * El barrido de seguridad de los ENVÍOS (ADR-0019 §1.3 y §3.2). Una pasada, por agencia:
 *
 *   1. **Reservados y sin `wamid` con el arrendamiento vencido** → el proceso murió entre la
 *      reserva y la respuesta de Meta. NO se reenvían (C5): se marcan `FALLIDO` «sin confirmar», y
 *      si Meta lo había aceptado su webhook de estado lo corrige (T-059).
 *   2. **Pendientes listos** (sin reservar, arrendamiento vencido o sin él) → se reencolan; la cola
 *      los reclama con `SKIP LOCKED`, así que un solape de dos máquinas no los duplica.
 *
 * Un tenant que falla no impide a los demás. Sin contenido en los registros (R10).
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EnvioSinConfirmarError } from '../domain/errores-de-envio.js';
import {
  PuertoColaDeEnvios,
  PuertoEnviosSinResolver,
  PuertoMensajesSalientes,
} from './puertos-de-envio.js';
import { PuertoAvisoDeOutbox, PuertoOutbox } from './puertos-de-eventos.js';

const LIMITE_POR_AGENCIA = 100;

export interface ResultadoDeRecuperacion {
  reencolados: number;
  sinConfirmar: number;
}

@Injectable()
export class RecuperarEnviosSinResolver {
  private readonly log = new Logger(RecuperarEnviosSinResolver.name);

  constructor(
    @Inject(PuertoOutbox) private readonly agencias: PuertoOutbox,
    @Inject(PuertoEnviosSinResolver) private readonly sinResolver: PuertoEnviosSinResolver,
    @Inject(PuertoMensajesSalientes) private readonly mensajes: PuertoMensajesSalientes,
    @Inject(PuertoColaDeEnvios) private readonly cola: PuertoColaDeEnvios,
    @Optional() @Inject(PuertoAvisoDeOutbox) private readonly avisos?: PuertoAvisoDeOutbox,
  ) {}

  async barrer(): Promise<ResultadoDeRecuperacion> {
    const total: ResultadoDeRecuperacion = { reencolados: 0, sinConfirmar: 0 };
    for (const tenantId of await this.agencias.tenantsParaBarrer()) {
      try {
        const r = await this.deUnaAgencia(tenantId);
        total.reencolados += r.reencolados;
        total.sinConfirmar += r.sinConfirmar;
      } catch {
        // Sin el mensaje: el de un error de base puede traer la fila (R10).
        this.log.error(
          'El barrido de envíos falló para una agencia; se reintenta en el siguiente.',
        );
      }
    }
    if (total.reencolados > 0 || total.sinConfirmar > 0) {
      this.log.warn(
        `Barrido de envíos: ${total.reencolados} reencolado(s), ${total.sinConfirmar} sin confirmar.`,
      );
    }
    return total;
  }

  private async deUnaAgencia(tenantId: string): Promise<ResultadoDeRecuperacion> {
    const r: ResultadoDeRecuperacion = { reencolados: 0, sinConfirmar: 0 };
    const sinConfirmar = await this.sinResolver.listarSinConfirmar(tenantId, LIMITE_POR_AGENCIA);
    for (const id of sinConfirmar) {
      const escrito = await this.mensajes.registrarFallo(tenantId, id, {
        codigoMeta: null,
        message: new EnvioSinConfirmarError().message,
      });
      if (escrito) {
        r.sinConfirmar += 1;
        this.avisos?.avisar(tenantId);
      }
    }
    for (const id of await this.sinResolver.listarListos(tenantId, LIMITE_POR_AGENCIA)) {
      await this.cola.encolar(tenantId, id);
      r.reencolados += 1;
    }
    return r;
  }
}
