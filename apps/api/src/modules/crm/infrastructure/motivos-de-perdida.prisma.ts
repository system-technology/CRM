/**
 * Adaptador de los motivos de pérdida (T-229). Todo en `conTenant()` (RLS, rol `viajapro_app`) y
 * con `tenantId` explícito además (R1): el filtro no es la única defensa.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ActualizarMotivoDePerdida,
  CrearMotivoDePerdida,
  MotivoDePerdida,
} from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoMotivosDePerdida } from '../application/puerto-motivos-de-perdida.js';
import { EtiquetaDeMotivoRepetidaError } from '../domain/errors.js';

type Fila = Prisma.MotivoDePerdidaGetPayload<object>;

export function aMotivoDePerdida(f: Fila): MotivoDePerdida {
  return {
    id: f.id,
    clave: f.clave,
    etiqueta: f.etiqueta,
    orden: f.orden,
    activo: f.activo,
    exigeNota: f.exigeNota,
  };
}

function esViolacionDeUnicidad(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class MotivosDePerdidaPrisma extends PuertoMotivosDePerdida {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async listar(incluirInactivos: boolean): Promise<MotivoDePerdida[]> {
    const { tenantId } = ContextoTenant.obtener();
    const filas = await this.prisma.conTenant((tx) =>
      tx.motivoDePerdida.findMany({
        where: { tenantId, ...(incluirInactivos ? {} : { activo: true }) },
        orderBy: [{ orden: 'asc' }, { etiqueta: 'asc' }],
      }),
    );
    return filas.map(aMotivoDePerdida);
  }

  async buscar(id: string): Promise<MotivoDePerdida | null> {
    const { tenantId } = ContextoTenant.obtener();
    const fila = await this.prisma.conTenant((tx) =>
      tx.motivoDePerdida.findFirst({ where: { id, tenantId } }),
    );
    return fila ? aMotivoDePerdida(fila) : null;
  }

  async crear(datos: CrearMotivoDePerdida, actorId: string | null): Promise<MotivoDePerdida> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      const fila = await this.prisma.conTenant(async (tx) => {
        const ultimo = await tx.motivoDePerdida.aggregate({
          where: { tenantId },
          _max: { orden: true },
        });
        return tx.motivoDePerdida.create({
          data: {
            tenantId,
            clave: null,
            etiqueta: datos.etiqueta,
            orden: (ultimo._max.orden ?? -1) + 1,
            exigeNota: datos.exigeNota,
            creadoPorId: actorId,
            actualizadoPorId: actorId,
          },
        });
      });
      return aMotivoDePerdida(fila);
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new EtiquetaDeMotivoRepetidaError(datos.etiqueta);
      throw error;
    }
  }

  async actualizar(
    id: string,
    cambios: ActualizarMotivoDePerdida,
    actorId: string | null,
  ): Promise<MotivoDePerdida | null> {
    const { tenantId } = ContextoTenant.obtener();
    try {
      const fila = await this.prisma.conTenant(async (tx) => {
        const existente = await tx.motivoDePerdida.findFirst({ where: { id, tenantId } });
        if (!existente) return null;
        return tx.motivoDePerdida.update({
          where: { id_tenantId: { id, tenantId } },
          data: {
            ...(cambios.etiqueta !== undefined ? { etiqueta: cambios.etiqueta } : {}),
            ...(cambios.orden !== undefined ? { orden: cambios.orden } : {}),
            ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
            ...(cambios.exigeNota !== undefined ? { exigeNota: cambios.exigeNota } : {}),
            actualizadoPorId: actorId,
          },
        });
      });
      return fila ? aMotivoDePerdida(fila) : null;
    } catch (error) {
      if (esViolacionDeUnicidad(error) && cambios.etiqueta !== undefined) {
        throw new EtiquetaDeMotivoRepetidaError(cambios.etiqueta);
      }
      throw error;
    }
  }
}
