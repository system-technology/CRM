/**
 * `POST /api/v1/identidad/miembros/:id/baja`: dar de baja a un miembro de la agencia.
 *
 * **Quién puede.** Solo `usuarios.administrar` (la ruta lo exige y el caso de uso lo vuelve a
 * comprobar). **Nadie se da de baja a sí mismo**: la última persona con permisos de administración
 * dejaría la agencia sin quien la administre.
 *
 * **Qué pasa con sus conversaciones.** En la misma transacción pasan a «sin asignar» y vuelven a la
 * cola común (`docs/01-producto/12-visibilidad-de-conversaciones.md` §3): sin esto, las de quien se
 * fue quedarían invisibles para todo el que no es dueño. Lo hace `inbox`, por su puerto.
 *
 * **Nadie da de baja a quien tiene más permisos que él** (403), y **la agencia nunca se queda sin un
 * Dueño activo** (409), aunque quien la da sea otro dueño.
 *
 * Es idempotente: darlo de baja otra vez responde igual y no cambia nada.
 */
import { Inject, Injectable } from '@nestjs/common';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoMiembros } from '../domain/puertos-de-miembros.js';
import type { Permiso } from '@viajapro/contracts';
import {
  MiembroNoEncontradoError,
  NoPuedeDarseDeBajaError,
  NoPuedeDejarSinDuenoError,
} from './errores.js';

@Injectable()
export class DarDeBajaMiembroUseCase {
  constructor(@Inject(PuertoMiembros) private readonly miembros: PuertoMiembros) {}

  async ejecutar(usuarioId: string): Promise<void> {
    const contexto = ContextoTenant.obtener();
    if (!contexto.permisos.has('usuarios.administrar')) {
      throw permisoDenegado('usuarios.administrar');
    }
    if (contexto.usuarioId === usuarioId) throw new NoPuedeDarseDeBajaError();

    const r = await this.miembros.darDeBaja(usuarioId, contexto.permisos);
    if (r === 'no_encontrado') throw new MiembroNoEncontradoError();
    if (r === 'ultimo_dueno') throw new NoPuedeDejarSinDuenoError();
    if (typeof r === 'object') throw permisoDenegado(r.faltaPermiso as Permiso);
  }
}
