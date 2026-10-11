/**
 * Caso de uso: arrastrar una tarjeta a otra etapa.
 *
 * **Aquí vive la regla que el contrato no puede comprobar.** El esquema Zod valida que «OTRO»
 * lleve explicación, porque eso se ve en la propia petición. Lo que no puede ver es si el
 * `etapaId` de destino es una etapa de pérdida: eso está en `etapas_pipeline`, y un esquema no
 * lee otra tabla.
 *
 * El orden importa y no es casual: primero se comprueba que la etapa **exista en esta agencia**
 * —un id de otra agencia no es «no encontrado» por casualidad: RLS hace que no exista— y solo
 * después se juzga el motivo.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MoverOportunidad as Movimiento, Oportunidad } from '@viajapro/contracts';
import {
  EtapaNoEncontradaError,
  MotivoEnEtapaViva,
  OportunidadNoEncontradaError,
  PerdidaSinMotivoError,
} from '../domain/errors.js';
import { comprobarMotivoDePerdida } from '../domain/regla-de-perdida.js';
import { PuertoCrm } from './puerto-crm.js';

@Injectable()
export class MoverOportunidadUseCase {
  private readonly log = new Logger(MoverOportunidadUseCase.name);

  constructor(@Inject(PuertoCrm) private readonly crm: PuertoCrm) {}

  async ejecutar(oportunidadId: string, movimiento: Movimiento): Promise<Oportunidad> {
    const oportunidad = await this.crm.buscarOportunidad(oportunidadId);
    if (!oportunidad) throw new OportunidadNoEncontradaError(oportunidadId);

    const destino = await this.crm.buscarEtapa(movimiento.etapaId);
    if (!destino) throw new EtapaNoEncontradaError(movimiento.etapaId);

    const violacion = comprobarMotivoDePerdida(destino.esPerdida, movimiento.motivoPerdida);
    if (violacion === 'FALTA_MOTIVO') throw new PerdidaSinMotivoError(destino.nombre);
    if (violacion === 'MOTIVO_SOBRANTE') throw new MotivoEnEtapaViva(destino.nombre);

    const movida = await this.crm.moverOportunidad({
      oportunidadId,
      etapaId: movimiento.etapaId,
      motivoPerdida: movimiento.motivoPerdida,
      notaPerdida: movimiento.notaPerdida,
    });

    this.log.log(
      `Oportunidad ${oportunidadId}: '${oportunidad.etapa.nombre}' → '${destino.nombre}'` +
        (movimiento.motivoPerdida ? ` (${movimiento.motivoPerdida})` : ''),
    );
    return movida;
  }
}
