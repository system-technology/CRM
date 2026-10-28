/** Lector del historial sobre `registros_auditoria`. Corre en `conTenant`: RLS aísla las agencias (R1). */

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { type FilaDeHistorial, LectorDeHistorial } from '../application/puertos-de-historial.js';

const ACCIONES = [
  'catalogo.tarifa.creada',
  'catalogo.tarifa.modificada',
  'catalogo.tarifa.eliminada',
];

@Injectable()
export class LectorDeHistorialPrisma extends LectorDeHistorial {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  leer(
    tarifaId: string,
    tope: number,
    cursor: string | undefined,
  ): Promise<readonly FilaDeHistorial[] | null> {
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.registroAuditoria.findMany({
        where: {
          entidad: 'tarifa',
          entidadId: tarifaId,
          accion: { in: ACCIONES },
          ...(cursor === undefined ? {} : { id: { lt: BigInt(cursor) } }),
        },
        orderBy: { id: 'desc' },
        take: tope,
      });
      if (filas.length === 0 && cursor === undefined) {
        const existe = await tx.tarifa.findFirst({ where: { id: tarifaId }, select: { id: true } });
        if (!existe) return null;
      }
      return filas.map((f) => ({
        id: f.id.toString(),
        ocurridoEn: f.ocurridoEn,
        usuarioId: f.usuarioId,
        accion: f.accion,
        detalle: f.detalle,
      }));
    });
  }
}
