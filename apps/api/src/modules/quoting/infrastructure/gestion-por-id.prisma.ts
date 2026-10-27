/**
 * Adaptador Prisma de la gestión por id. Todo corre sobre el `tx` que abre `conTenant`: el tenant
 * está fijado y RLS lo hace cumplir (R1); las foráneas compuestas `(id, tenant_id)` impiden colgar
 * filas de otra agencia aunque se olvidara un `WHERE`.
 */

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type EspacioDeGestion,
  OperacionesPorId,
  UnidadDeTrabajoDeGestion,
  type VentanaDeVigencia,
} from '../application/puertos-de-gestion.js';
import { CatalogoPrisma, RegistroDeCambiosPrisma } from './catalogo.prisma.js';

const aFecha = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

class OperacionesPorIdPrisma extends OperacionesPorId {
  constructor(private readonly tx: ClienteTenant) {
    super();
  }

  async nombreDeMayorista(id: string): Promise<string | null> {
    const fila = await this.tx.mayorista.findFirst({
      where: { id, eliminadoEn: null },
      select: { nombre: true },
    });
    return fila?.nombre ?? null;
  }

  async actualizarVigencia(id: string, ventana: VentanaDeVigencia): Promise<void> {
    await this.tx.vigencia.update({
      where: { id },
      data: {
        desde: aFecha(ventana.desde),
        hasta: aFecha(ventana.hasta),
        publicada: ventana.publicada,
        cupoTotal: ventana.cupoTotal,
      },
    });
  }

  async eliminarTarifa(id: string): Promise<void> {
    await this.tx.tarifa.delete({ where: { id } });
  }
}

@Injectable()
export class UnidadDeTrabajoDeGestionPrisma extends UnidadDeTrabajoDeGestion {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  ejecutar<T>(fn: (espacio: EspacioDeGestion) => Promise<T>): Promise<T> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant((tx) =>
      fn({
        catalogo: new CatalogoPrisma(tx, tenantId),
        registro: new RegistroDeCambiosPrisma(tx, tenantId),
        porId: new OperacionesPorIdPrisma(tx),
      }),
    );
  }
}
