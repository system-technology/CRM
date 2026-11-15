/**
 * `GET /api/v1/identidad/miembros/asignables`: a quién se puede asignar una conversación (ADR-0022).
 *
 * Exige `bandeja.operar` (la ruta lo declara y el caso de uso lo vuelve a comprobar). Bajo RLS.
 * Devuelve solo id y nombre; el criterio de «asignable» es el mismo que aplica `PUT
 * /conversaciones/:id/asignacion`.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { MiembroAsignable } from '@viajapro/contracts';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoMiembros } from '../domain/puertos-de-miembros.js';

@Injectable()
export class ListarMiembrosAsignablesUseCase {
  constructor(@Inject(PuertoMiembros) private readonly miembros: PuertoMiembros) {}

  async ejecutar(): Promise<MiembroAsignable[]> {
    if (!ContextoTenant.tienePermiso('bandeja.operar')) {
      throw permisoDenegado('bandeja.operar');
    }
    return this.miembros.listarAsignables();
  }
}
