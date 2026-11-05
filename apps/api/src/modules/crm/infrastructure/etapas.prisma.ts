/**
 * Adaptador de escritura de etapas (T-120). Todo en `conTenant()` y con `tenantId` explícito
 * además de RLS (R1). Las reglas viven en `domain/reglas-de-etapas.ts`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrearEtapa, EditarEtapa, EtapaDefinida } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoEtapas } from '../application/puerto-etapas.js';
import { OrdenDeEtapaOcupadoError } from '../domain/errors.js';
import { exigirEtapaViva, exigirPermutacion } from '../domain/reglas-de-etapas.js';
import { aEtapaDefinida } from './crm.prisma.js';

function esViolacionDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class EtapasPrisma extends PuertoEtapas {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async crear(datos: CrearEtapa): Promise<EtapaDefinida> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant(async (tx) => {
        const ultima = await tx.etapaPipeline.aggregate({
          where: { tenantId },
          _max: { orden: true },
        });
        const fila = await tx.etapaPipeline.create({
          data: {
            tenantId,
            nombre: datos.nombre,
            clave: null,
            orden: (ultima._max.orden ?? -1) + 1,
            probabilidad: datos.probabilidad,
            esGanada: datos.esGanada,
            esPerdida: datos.esPerdida,
          },
        });
        // Si la agencia no tenía ninguna y la primera es terminal, falta la etapa viva.
        exigirEtapaViva(await tx.etapaPipeline.findMany({ where: { tenantId } }));
        return aEtapaDefinida(fila);
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new OrdenDeEtapaOcupadoError();
      throw error;
    }
  }

  async editar(etapaId: string, cambios: EditarEtapa): Promise<EtapaDefinida | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const existente = await tx.etapaPipeline.findFirst({ where: { id: etapaId, tenantId } });
      if (!existente) return null;
      // Marcar una etapa como ganada desactiva su condición de perdida, y al revés: nunca
      // quedan las dos a la vez.
      const esGanada =
        cambios.esGanada ?? (cambios.esPerdida === true ? false : existente.esGanada);
      const esPerdida =
        cambios.esPerdida ?? (cambios.esGanada === true ? false : existente.esPerdida);
      const fila = await tx.etapaPipeline.update({
        where: { id_tenantId: { id: etapaId, tenantId } },
        data: {
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.probabilidad !== undefined ? { probabilidad: cambios.probabilidad } : {}),
          esGanada,
          esPerdida,
        },
      });
      exigirEtapaViva(await tx.etapaPipeline.findMany({ where: { tenantId } }));
      return aEtapaDefinida(fila);
    });
  }

  async reordenar(ids: ReadonlyArray<string>): Promise<EtapaDefinida[]> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      return await this.prisma.conTenant(async (tx) => {
        // Bloquea las filas de la agencia: dos reordenamientos simultáneos se serializan.
        await tx.$queryRaw`SELECT id FROM etapas_pipeline WHERE tenant_id = ${tenantId}::uuid FOR UPDATE`;
        const actuales = await tx.etapaPipeline.findMany({
          where: { tenantId },
          select: { id: true },
        });
        exigirPermutacion(
          actuales.map((e) => e.id),
          ids,
        );
        // `(tenant_id, orden)` es único y no diferible: primero se aparta a posiciones negativas
        // y luego se asignan las definitivas, para que ningún paso intermedio choque.
        for (const [i, id] of ids.entries()) {
          await tx.etapaPipeline.update({
            where: { id_tenantId: { id, tenantId } },
            data: { orden: -(i + 1) },
          });
        }
        for (const [i, id] of ids.entries()) {
          await tx.etapaPipeline.update({
            where: { id_tenantId: { id, tenantId } },
            data: { orden: i },
          });
        }
        const filas = await tx.etapaPipeline.findMany({
          where: { tenantId },
          orderBy: { orden: 'asc' },
        });
        return filas.map(aEtapaDefinida);
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new OrdenDeEtapaOcupadoError();
      throw error;
    }
  }
}
