/**
 * `PATCH /api/v1/identidad/miembros/:id/apodo`: fijar o quitar el apodo de ingreso de un miembro
 * existente (ADR-0031 §2).
 *
 * **Quién puede.** `usuarios.administrar` (la ruta lo exige y el caso de uso lo vuelve a comprobar),
 * con la MISMA guarda que la baja: nadie edita el apodo de quien tiene más permisos que él (403).
 * Un dueño sí puede cambiar el de otro dueño. No hay autoasignación libre: sin el permiso no se
 * llega aquí. Solo sobre miembros existentes, nunca al invitar.
 *
 * **Apagado (B3).** Con el índice global y más de una agencia, la función no existe: responde un
 * error genérico, nunca el 409 (que enumeraría los apodos de otras agencias).
 *
 * El apodo llega ya normalizado y validado por el contrato (`CambiarApodo`). No se imprime.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoMiembros } from '../domain/puertos-de-miembros.js';
import {
  ApodoNoDisponibleError,
  CambioDeApodoNoAdmitidoError,
  MiembroNoEncontradoError,
} from './errores.js';
import { GuardiaDeApodos } from './guardia-de-apodos.js';

@Injectable()
export class CambiarApodoDeMiembroUseCase {
  constructor(
    @Inject(PuertoMiembros) private readonly miembros: PuertoMiembros,
    @Inject(GuardiaDeApodos) private readonly guardia: GuardiaDeApodos,
  ) {}

  async ejecutar(usuarioId: string, apodo: string | null): Promise<void> {
    const contexto = ContextoTenant.obtener();
    if (!contexto.permisos.has('usuarios.administrar')) {
      throw permisoDenegado('usuarios.administrar');
    }
    if (await this.guardia.estaApagada()) throw new CambioDeApodoNoAdmitidoError();

    const r = await this.miembros.cambiarApodo(usuarioId, apodo, contexto.permisos);
    if (r === 'no_encontrado') throw new MiembroNoEncontradoError();
    if (r === 'apodo_ocupado') throw new ApodoNoDisponibleError();
    if (typeof r === 'object') throw permisoDenegado(r.faltaPermiso as Permiso);
  }
}
