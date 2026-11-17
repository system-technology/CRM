/**
 * `PuertoUsuariosConPermiso` (T-254): quién, en una agencia, está activo y puede hacer algo. Lo usa
 * `notifications` para decidir a quién avisa sin leer `usuarios` ni `roles` (R4).
 *
 * Corre en la transacción del llamador (RLS con el tenant de la fila del outbox) y repite el
 * predicado de tenant (R1). El permiso sale de `roles.permisos` leído bajo RLS, como en cada
 * petición (ADR-0011): nunca de una sesión.
 */
import { Injectable } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { PuertoUsuariosConPermiso } from '../../../shared/puertos/puertos-para-avisos.js';

@Injectable()
export class UsuariosConPermisoPrisma extends PuertoUsuariosConPermiso {
  async activosConPermiso(
    tx: ClienteTenant,
    tenantId: string,
    permiso: Permiso,
    entre?: readonly string[],
  ): Promise<string[]> {
    const filas = await tx.usuario.findMany({
      where: {
        tenantId,
        activo: true,
        eliminadoEn: null,
        rol: { tenantId, permisos: { has: permiso } },
        ...(entre ? { id: { in: [...entre] } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return filas.map((f) => f.id);
  }
}
