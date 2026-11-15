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
import {
  MotivoPerdida,
  type MoverOportunidad as Movimiento,
  type Oportunidad,
} from '@viajapro/contracts';
import {
  EtapaNoEncontradaError,
  MotivoDePerdidaContradictorioError,
  MotivoDePerdidaInactivoError,
  MotivoDePerdidaNoEncontradoError,
  MotivoEnEtapaViva,
  NotaDePerdidaObligatoriaError,
  OportunidadNoEncontradaError,
  PerdidaSinMotivoError,
} from '../domain/errors.js';
import { comprobarMotivoDePerdida } from '../domain/regla-de-perdida.js';
import { PuertoCrm } from './puerto-crm.js';
import { PuertoMotivosDePerdida } from './puerto-motivos-de-perdida.js';

@Injectable()
export class MoverOportunidadUseCase {
  private readonly log = new Logger(MoverOportunidadUseCase.name);

  constructor(
    @Inject(PuertoCrm) private readonly crm: PuertoCrm,
    @Inject(PuertoMotivosDePerdida) private readonly motivos: PuertoMotivosDePerdida,
  ) {}

  /**
   * T-229: si llega `motivoPerdidaId`, manda. Debe existir en ESTA agencia (un id ajeno es «no
   * existe», porque RLS lo oculta) y estar activo; el enum se deriva de su `clave`, y es `OTRO`
   * si el motivo es propio de la agencia (sin clave). La base guarda el id tal cual
   * (disparador de 20261115190000), así que el motivo propio no se pierde en «Otro».
   * Sin id, el comportamiento es el de siempre (enum del contrato).
   */
  private async resolverMotivo(
    movimiento: Movimiento,
  ): Promise<{ motivoPerdida: MotivoPerdida | null; motivoPerdidaId: string | null }> {
    const id = movimiento.motivoPerdidaId ?? null;
    if (id === null) return { motivoPerdida: movimiento.motivoPerdida, motivoPerdidaId: null };

    const motivo = await this.motivos.buscar(id);
    if (!motivo) throw new MotivoDePerdidaNoEncontradoError(id);
    if (!motivo.activo) throw new MotivoDePerdidaInactivoError(id);

    const deClave = MotivoPerdida.safeParse(motivo.clave);
    const derivado: MotivoPerdida = deClave.success ? deClave.data : 'OTRO';
    if (movimiento.motivoPerdida !== null && movimiento.motivoPerdida !== derivado) {
      throw new MotivoDePerdidaContradictorioError();
    }
    // `exigeNota` es la regla (R12). Además, todo lo que se guarda como OTRO lleva explicación,
    // también un motivo propio: el contrato `Oportunidad` (lo que lee la web) rechaza «OTRO» sin
    // nota, y una oportunidad que no se puede leer es peor que una nota de más.
    const exigeNota = motivo.exigeNota || derivado === 'OTRO';
    if (exigeNota && !movimiento.notaPerdida?.trim()) {
      throw new NotaDePerdidaObligatoriaError(motivo.etiqueta);
    }
    return { motivoPerdida: derivado, motivoPerdidaId: motivo.id };
  }

  async ejecutar(
    oportunidadId: string,
    movimiento: Movimiento,
    actorId: string | null,
  ): Promise<Oportunidad> {
    const oportunidad = await this.crm.buscarOportunidad(oportunidadId);
    if (!oportunidad) throw new OportunidadNoEncontradaError(oportunidadId);

    const destino = await this.crm.buscarEtapa(movimiento.etapaId);
    if (!destino) throw new EtapaNoEncontradaError(movimiento.etapaId);

    const { motivoPerdida, motivoPerdidaId } = await this.resolverMotivo(movimiento);
    const violacion = comprobarMotivoDePerdida(destino.esPerdida, motivoPerdida);
    if (violacion === 'FALTA_MOTIVO') throw new PerdidaSinMotivoError(destino.nombre);
    if (violacion === 'MOTIVO_SOBRANTE') throw new MotivoEnEtapaViva(destino.nombre);

    const movida = await this.crm.moverOportunidad({
      oportunidadId,
      etapaId: movimiento.etapaId,
      motivoPerdida,
      motivoPerdidaId,
      notaPerdida: movimiento.notaPerdida,
      actorId,
    });

    this.log.log(
      `Oportunidad ${oportunidadId}: '${oportunidad.etapa.nombre}' → '${destino.nombre}'` +
        (motivoPerdida ? ` (${motivoPerdida})` : ''),
    );
    return movida;
  }
}
