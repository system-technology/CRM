/** Casos de uso de las etapas del pipeline (T-120): listar, crear, editar y reordenar. */
import { Inject, Injectable } from '@nestjs/common';
import type { CrearEtapa, EditarEtapa, EtapaDefinida, ReordenarEtapas } from '@viajapro/contracts';
import { EtapaNoEncontradaError } from '../domain/errors.js';
import { PuertoCrm } from './puerto-crm.js';
import { PuertoEtapas } from './puerto-etapas.js';

@Injectable()
export class GestionarEtapas {
  constructor(
    @Inject(PuertoCrm) private readonly crm: PuertoCrm,
    @Inject(PuertoEtapas) private readonly etapas: PuertoEtapas,
  ) {}

  listar(): Promise<EtapaDefinida[]> {
    return this.crm.listarEtapas();
  }

  crear(datos: CrearEtapa): Promise<EtapaDefinida> {
    return this.etapas.crear(datos);
  }

  async editar(id: string, cambios: EditarEtapa): Promise<EtapaDefinida> {
    const etapa = await this.etapas.editar(id, cambios);
    if (!etapa) throw new EtapaNoEncontradaError(id);
    return etapa;
  }

  reordenar(entrada: ReordenarEtapas): Promise<EtapaDefinida[]> {
    return this.etapas.reordenar(entrada.ids);
  }
}
