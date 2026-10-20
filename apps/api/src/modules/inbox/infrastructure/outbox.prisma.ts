/**
 * El outbox leído y marcado por el relay, bajo RLS con el tenant resuelto (rol `viajapro_webhook`).
 *
 * Lo que se publica ya estaba escrito en la misma transacción que el cambio de estado. Aquí solo se
 * lee y se marca: `FOR UPDATE SKIP LOCKED` para que dos relés no publiquen lo mismo, y `publicado_en`
 * se escribe en la MISMA transacción que la publicación (si publicar lanza, nada queda marcado).
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import { type EventoPendiente, PuertoOutbox } from '../application/puertos-de-eventos.js';

interface FilaDeOutbox {
  id: bigint;
  tipo_evento: string;
  agregado_id: string;
  payload: unknown;
}

@Injectable()
export class OutboxPrisma extends PuertoOutbox {
  constructor(@Inject(PrismaWebhookService) private readonly prisma: PrismaWebhookService) {
    super();
  }

  async publicarPendientes(
    tenantId: string,
    publicar: (eventos: EventoPendiente[]) => Promise<void>,
    limite: number,
  ): Promise<number> {
    return this.prisma.conTenantResuelto(tenantId, async (tx) => {
      const filas = await tx.$queryRaw<FilaDeOutbox[]>`
        SELECT id, tipo_evento, agregado_id::text AS agregado_id, payload
          FROM outbox
         WHERE publicado_en IS NULL AND tenant_id = ${tenantId}::uuid
         ORDER BY id
         LIMIT ${limite}
           FOR UPDATE SKIP LOCKED`;
      if (filas.length === 0) return 0;

      await publicar(
        filas.map((f) => ({
          id: f.id.toString(),
          tipo: f.tipo_evento,
          tenantId,
          agregadoId: f.agregado_id,
          payload:
            typeof f.payload === 'object' && f.payload !== null
              ? (f.payload as Record<string, unknown>)
              : {},
        })),
      );

      await tx.$executeRaw`
        UPDATE outbox SET publicado_en = now()
         WHERE tenant_id = ${tenantId}::uuid AND id = ANY(${filas.map((f) => f.id)}::bigint[])`;
      return filas.length;
    });
  }

  async tenantsParaBarrer(): Promise<string[]> {
    // `tenants` es global y de solo lectura para este rol.
    const agencias = await this.prisma.tenant.findMany({
      where: { estado: { in: ['ACTIVO', 'EN_PRUEBA'] } },
      select: { id: true },
    });
    return agencias.map((a) => a.id);
  }
}
