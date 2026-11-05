/**
 * `GET /api/v1/agencia/ajustes`: nombre, país, moneda y zona horaria de la agencia activa.
 *
 * Cualquier miembro autenticado: la web necesita la zona para formatear fechas (R9). El tenant
 * sale de la sesión; `tenants` es global (sin RLS), así que el predicado `id` va explícito.
 * Solo lectura: la app no tiene UPDATE sobre `tenants`.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AjustesDeAgencia } from '@viajapro/contracts';
import { AgenciaNoEncontradaError } from './errores.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';

@Injectable()
export class AjustesDeAgenciaUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async obtener(): Promise<AjustesDeAgencia> {
    const { tenantId } = ContextoTenant.obtener();
    const fila = await this.prisma.conTenant((tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { nombre: true, paisIso: true, monedaIso: true, zonaHoraria: true },
      }),
    );
    if (!fila) throw new AgenciaNoEncontradaError();
    return fila;
  }
}
