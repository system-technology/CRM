/**
 * Lo que `inbox` ofrece a `identity` cuando se da de baja a un miembro: soltar sus conversaciones.
 * Corre dentro de la transacción del llamador, bajo el tenant ya fijado. Ver
 * `shared/puertos/puertos-hacia-inbox.ts`.
 */
import { Injectable } from '@nestjs/common';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { PuertoConversacionesDeMiembro } from '../../../shared/puertos/puertos-hacia-inbox.js';
import { TIPO_CONVERSACION_ACTUALIZADA } from '../domain/evento-de-dominio.js';

@Injectable()
export class ConversacionesDeMiembroDeInbox extends PuertoConversacionesDeMiembro {
  async soltarLasDe(tx: ClienteTenant, tenantId: string, usuarioId: string): Promise<number> {
    const filas = await tx.conversacion.findMany({
      where: { tenantId, asignadoAId: usuarioId },
      select: { id: true },
    });
    if (filas.length === 0) return 0;

    await tx.conversacion.updateMany({
      where: { tenantId, asignadoAId: usuarioId },
      data: { asignadoAId: null },
    });
    // Un evento por conversación, en esta misma transacción (outbox): los demás miembros ven
    // aparecer la conversación en la cola común sin recargar.
    await tx.outbox.createMany({
      data: filas.map((f) => ({
        tenantId,
        agregado: 'conversacion',
        agregadoId: f.id,
        tipoEvento: TIPO_CONVERSACION_ACTUALIZADA,
        payload: { anteriorAsignadoAId: usuarioId },
      })),
    });
    return filas.length;
  }
}
