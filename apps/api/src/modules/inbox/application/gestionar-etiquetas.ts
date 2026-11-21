/**
 * El catálogo de etiquetas de la agencia (T-325): listar (cualquiera con acceso a la bandeja) y
 * crear, renombrar, recolorear, ordenar y borrar (`etiquetas.administrar`, que exige el controlador).
 *
 * Aquí no se registra el nombre de ninguna etiqueta (R10): ni en logs ni en eventos.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ActualizarEtiquetaCuerpo,
  CrearEtiquetaCuerpo,
  Etiqueta,
  ListaDeEtiquetas,
} from '@viajapro/contracts';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { EtiquetaNoEncontradaError } from '../domain/errores-de-etiqueta.js';
import { PuertoDeEtiquetas } from './puerto-de-etiquetas.js';

@Injectable()
export class GestionarEtiquetasUseCase {
  constructor(@Inject(PuertoDeEtiquetas) private readonly etiquetas: PuertoDeEtiquetas) {}

  async listar(): Promise<ListaDeEtiquetas> {
    return { datos: await this.etiquetas.listar() };
  }

  crear(cuerpo: CrearEtiquetaCuerpo): Promise<Etiqueta> {
    return this.etiquetas.crear(ContextoTenant.obtener().usuarioId, cuerpo);
  }

  async actualizar(id: string, cambios: ActualizarEtiquetaCuerpo): Promise<Etiqueta> {
    const e = await this.etiquetas.actualizar(ContextoTenant.obtener().usuarioId, id, cambios);
    if (!e) throw new EtiquetaNoEncontradaError();
    return e;
  }

  async borrar(id: string): Promise<void> {
    if (!(await this.etiquetas.borrar(id))) throw new EtiquetaNoEncontradaError();
  }
}
