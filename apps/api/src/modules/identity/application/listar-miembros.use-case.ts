/**
 * `GET /api/v1/identidad/miembros`: los miembros de la agencia (T-121).
 *
 * Solo `usuarios.administrar` (la ruta lo exige y el caso de uso lo vuelve a comprobar, igual que
 * la baja). Bajo RLS: nunca aparece alguien de otra agencia. No devuelve nada de la identidad
 * global ni de credenciales: solo la pertenencia a esta agencia.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { MiembroDeAgencia } from '@viajapro/contracts';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoMiembros } from '../domain/puertos-de-miembros.js';

@Injectable()
export class ListarMiembrosUseCase {
  constructor(@Inject(PuertoMiembros) private readonly miembros: PuertoMiembros) {}

  async ejecutar(): Promise<MiembroDeAgencia[]> {
    if (!ContextoTenant.tienePermiso('usuarios.administrar')) {
      throw permisoDenegado('usuarios.administrar');
    }
    return this.miembros.listar();
  }
}
