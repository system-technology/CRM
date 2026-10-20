/**
 * El selector de agencia: el índice `accesos_identidad` (pool de identidad, que lo puede leer sin
 * tenant) y el nombre de cada agencia (pool de la API, sobre `tenants`, que es global y de solo
 * lectura).
 *
 * Es informativo. Que una agencia aparezca aquí no da acceso a nada: cambiar a ella pasa por el
 * paso 4, bajo RLS.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AgenciaDeAcceso } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { agenciaPermiteAcceso } from '../domain/estados-de-agencia.js';
import { PuertoAgencias } from '../domain/puertos.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

@Injectable()
export class AgenciasPrisma extends PuertoAgencias {
  constructor(
    @Inject(PrismaIdentidadService) private readonly identidad: PrismaIdentidadService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super();
  }

  async listarDe(identidadId: string): Promise<AgenciaDeAcceso[]> {
    const accesos = await this.identidad.accesoIdentidad.findMany({
      where: { identidadId },
      select: { tenantAccesoId: true },
    });
    if (accesos.length === 0) return [];

    const agencias = await this.prisma.sinTenantDeclarado(
      'identity/listar-agencias-de-acceso',
      (tx) =>
        tx.tenant.findMany({
          where: { id: { in: accesos.map((a) => a.tenantAccesoId) } },
          select: { id: true, nombre: true, slug: true, estado: true },
          orderBy: { nombre: 'asc' },
        }),
    );

    // Una agencia suspendida no se ofrece: elegirla solo llevaría a un rechazo.
    return agencias
      .filter((a) => agenciaPermiteAcceso(a.estado))
      .map(({ id, nombre, slug }) => ({ id, nombre, slug }));
  }
}
