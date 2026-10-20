/**
 * `GET /api/v1/auth/session`: quién soy, en qué agencias estoy y cuál es la activa.
 *
 * No exige agencia activa —es justo lo que consulta la web para decidir si mostrar el
 * selector—, pero si hay una, la revalida igual que cualquier petición: una sesión con una
 * agencia a la que ya no se pertenece no debe enseñar permisos que no existen.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { SesionActual } from '@viajapro/contracts';
import { PuertoAgencias, PuertoMembresias, PuertoSesiones } from '../domain/puertos.js';
import { errorDeAcceso } from './errores.js';

@Injectable()
export class ObtenerSesionActual {
  constructor(
    @Inject(PuertoSesiones) private readonly sesiones: PuertoSesiones,
    @Inject(PuertoMembresias) private readonly membresias: PuertoMembresias,
    @Inject(PuertoAgencias) private readonly agencias: PuertoAgencias,
  ) {}

  async ejecutar(
    cookie: string | null,
  ): Promise<{ sesion: SesionActual; cookies: readonly string[] }> {
    const sesion = await this.sesiones.obtener(cookie);
    if (!sesion) throw errorDeAcceso('SIN_SESION');

    let acceso: SesionActual['acceso'] = null;
    if (sesion.tenantActivoId) {
      const m = await this.membresias.verificar(sesion.tenantActivoId, sesion.identidad.id);
      if (m.tipo !== 'vigente') {
        await this.sesiones.revocar(sesion.sesionId);
        throw errorDeAcceso(
          m.tipo === 'agencia_suspendida' ? 'AGENCIA_SUSPENDIDA' : 'ACCESO_REVOCADO',
        );
      }
      acceso = { usuarioId: m.usuarioId, rol: m.rol, permisos: [...m.permisos] };
    }

    return {
      cookies: sesion.cookies,
      sesion: {
        identidad: sesion.identidad,
        agencias: await this.agencias.listarDe(sesion.identidad.id),
        tenantActivoId: sesion.tenantActivoId,
        acceso,
      },
    };
  }
}
