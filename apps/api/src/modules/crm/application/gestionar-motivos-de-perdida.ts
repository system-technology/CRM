/** Casos de uso de los motivos de pérdida de la agencia (T-229): listar, crear y editar. */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ActualizarMotivoDePerdida,
  CrearMotivoDePerdida,
  MotivoDePerdida,
} from '@viajapro/contracts';
import { MotivoDePerdidaNoEncontradoError } from '../domain/errors.js';
import { PuertoMotivosDePerdida } from './puerto-motivos-de-perdida.js';

@Injectable()
export class GestionarMotivosDePerdida {
  constructor(@Inject(PuertoMotivosDePerdida) private readonly motivos: PuertoMotivosDePerdida) {}

  listar(incluirInactivos: boolean): Promise<MotivoDePerdida[]> {
    return this.motivos.listar(incluirInactivos);
  }

  crear(datos: CrearMotivoDePerdida, actorId: string | null): Promise<MotivoDePerdida> {
    return this.motivos.crear(datos, actorId);
  }

  async actualizar(
    id: string,
    cambios: ActualizarMotivoDePerdida,
    actorId: string | null,
  ): Promise<MotivoDePerdida> {
    const motivo = await this.motivos.actualizar(id, cambios, actorId);
    if (!motivo) throw new MotivoDePerdidaNoEncontradoError(id);
    return motivo;
  }
}
