/**
 * `POST /api/v1/auth/tenant-activo`: cambiar de agencia (ADR-0011, paso 2).
 *
 * **Comprueba antes de escribir.** El `tenantId` viene del cliente —es la única ruta donde es
 * legítimo, porque es justo lo que se está eligiendo— y por eso no vale nada hasta que la lectura
 * de `usuarios` bajo RLS, con ese valor como tenant, devuelve una fila activa de ESTA identidad.
 * RLS es lo que garantiza que esa fila es de esa agencia: sin membresía, o con la agencia
 * suspendida, no se escribe nada y la respuesta es 403.
 *
 * Un 403 aquí NO revoca la sesión: pedir una agencia ajena no invalida la sesión en las que sí
 * se tiene acceso.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PuertoMembresias, PuertoSesiones } from '../domain/puertos.js';
import { errorDeAcceso } from './errores.js';

@Injectable()
export class CambiarAgenciaActiva {
  constructor(
    @Inject(PuertoSesiones) private readonly sesiones: PuertoSesiones,
    @Inject(PuertoMembresias) private readonly membresias: PuertoMembresias,
  ) {}

  async ejecutar(cookie: string | null, tenantId: string): Promise<void> {
    const sesion = await this.sesiones.obtener(cookie);
    if (!sesion) throw errorDeAcceso('SIN_SESION');

    const membresia = await this.membresias.verificar(tenantId, sesion.identidad.id);
    if (membresia.tipo !== 'vigente') throw errorDeAcceso('SIN_MEMBRESIA');

    await this.sesiones.fijarTenantActivo(sesion.sesionId, tenantId);
  }
}
