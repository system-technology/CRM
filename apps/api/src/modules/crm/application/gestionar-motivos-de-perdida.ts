/** Casos de uso de los motivos de pérdida de la agencia (T-229): listar, crear y editar. */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ActualizarMotivoDePerdida,
  CrearMotivoDePerdida,
  MotivoDePerdida,
} from '@viajapro/contracts';
import { MotivoDePerdidaNoEncontradoError, MotivoOtroExigeNotaError } from '../domain/errors.js';
import { PuertoMotivosDePerdida } from './puerto-motivos-de-perdida.js';

/** La clave del motivo de sistema que siempre exige nota (`motivos_de_perdida_otro_exige_nota`). */
const CLAVE_OTRO = 'OTRO';

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
    // T-232: «Otro» siempre exige nota. La clave no se edita (el contrato la rechaza), así que leer
    // y luego escribir no tiene carrera que importe; y si la hubiera, la para el CHECK de la base.
    if (cambios.exigeNota === false) {
      const actual = await this.motivos.buscar(id);
      if (!actual) throw new MotivoDePerdidaNoEncontradoError(id);
      if (actual.clave === CLAVE_OTRO) throw new MotivoOtroExigeNotaError(id);
    }
    const motivo = await this.motivos.actualizar(id, cambios, actorId);
    if (!motivo) throw new MotivoDePerdidaNoEncontradoError(id);
    return motivo;
  }
}
