/**
 * Pasos 3 y 4 del flujo de ADR-0011, en un solo lugar.
 *
 *   3. La sesión existe y no está revocada, y trae agencia activa.
 *   4. Esa agencia, leída bajo RLS, sigue teniendo a esta identidad como usuario activo, y no
 *      está suspendida.
 *
 * Lo usan el middleware de tenant (cada petición) y, cuando exista, el socket (al conectar y
 * cada 60 segundos). Un solo caso de uso, porque si dos sitios implementaran «¿sigue dentro?»
 * acabarían decidiendo distinto.
 *
 * **Si el paso 4 da cero filas, la sesión se revoca.** Quien ya no pertenece a la agencia que
 * tenía activa (baja) o trabaja para una agencia suspendida no tiene nada que hacer con esa
 * sesión, y dejarla viva solo daría pie a que algo la reutilice.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  type EntradaDeAcceso,
  ResolutorDeAcceso,
  type ResultadoDeAcceso,
} from '../../../shared/puertos/puerto-de-acceso.js';
import { PuertoMembresias, PuertoSesiones } from '../domain/puertos.js';

@Injectable()
export class ResolverAcceso extends ResolutorDeAcceso {
  constructor(
    @Inject(PuertoSesiones) private readonly sesiones: PuertoSesiones,
    @Inject(PuertoMembresias) private readonly membresias: PuertoMembresias,
  ) {
    super();
  }

  async resolver(entrada: EntradaDeAcceso): Promise<ResultadoDeAcceso> {
    const sesion = await this.sesiones.obtener(entrada.cookie);
    if (!sesion) return { concedido: false, motivo: 'SIN_SESION', cookies: [] };

    if (!sesion.tenantActivoId) {
      return { concedido: false, motivo: 'SIN_AGENCIA_ACTIVA', cookies: sesion.cookies };
    }

    const membresia = await this.membresias.verificar(sesion.tenantActivoId, sesion.identidad.id);

    if (membresia.tipo === 'vigente') {
      return {
        concedido: true,
        cookies: sesion.cookies,
        acceso: {
          tenantId: sesion.tenantActivoId,
          usuarioId: membresia.usuarioId,
          identidadId: sesion.identidad.id,
          sesionId: sesion.sesionId,
          rol: membresia.rol,
          permisos: membresia.permisos,
        },
      };
    }

    await this.sesiones.revocar(sesion.sesionId);
    return {
      concedido: false,
      motivo: membresia.tipo === 'agencia_suspendida' ? 'AGENCIA_SUSPENDIDA' : 'ACCESO_REVOCADO',
      cookies: [],
    };
  }
}
