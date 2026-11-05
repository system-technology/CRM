/**
 * La reserva anti-duplicado del envío a Meta, DURABLE y en la propia fila del mensaje
 * (ADR-0019 §1.2 y §3.2). Sustituye al `SET NX` de Redis (ADR-0018 §3.2) en modo `unico`.
 *
 * `reservar` es un solo `UPDATE ... WHERE envio_reservado_en IS NULL AND wamid IS NULL RETURNING id`:
 * atómico entre procesos (si dos máquinas lo intentan a la vez, Postgres serializa las dos
 * escrituras de la fila y solo una ve `envio_reservado_en IS NULL`). **Cero filas = ya reservado =
 * NO se envía.** A diferencia del `SET NX`, no caduca: una fila reservada y sin `wamid` jamás se
 * reenvía; el barrido de seguridad la marca `FALLIDO` «sin confirmar» (`RecuperarEnviosSinResolver`).
 *
 * Corre en el contexto del trabajador (`viajapro_webhook`), siempre bajo el tenant resuelto: RLS lo
 * hace cumplir, y el `tenant_id` va además explícito en el `WHERE` (R1). No hay red dentro de la
 * transacción. `actualizado_en` lo pone Prisma (`@updatedAt`), no un disparador: con SQL crudo se
 * pone a mano.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import { PuertoReservaDeEnvio } from '../application/puertos-de-envio.js';

/** Lo único que los adaptadores de envíos necesitan de la base: una transacción con consulta cruda. */
export interface TransaccionDeEnvios {
  $queryRaw<T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<T>;
}

export interface ClienteDeEnvios {
  conTenantResuelto<T>(tenantId: string, fn: (tx: TransaccionDeEnvios) => Promise<T>): Promise<T>;
}

@Injectable()
export class ReservaDeEnvioPostgres extends PuertoReservaDeEnvio {
  constructor(@Inject(PrismaWebhookService) private readonly prisma: ClienteDeEnvios) {
    super();
  }

  async reservar(tenantId: string, mensajeId: string): Promise<boolean> {
    const filas = await this.prisma.conTenantResuelto(
      tenantId,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
        UPDATE mensajes
           SET envio_reservado_en = now(), actualizado_en = now()
         WHERE tenant_id = ${tenantId}::uuid AND id = ${mensajeId}::uuid
           AND direccion = 'SALIENTE'
           AND envio_reservado_en IS NULL AND wamid IS NULL
        RETURNING id`,
    );
    return filas.length === 1;
  }

  /**
   * Solo se llama cuando Meta respondió que NO aceptó el mensaje: reintentar es seguro. Con `wamid`
   * ya puesto no hace nada: lo aceptado no se desreserva.
   */
  async liberar(tenantId: string, mensajeId: string): Promise<void> {
    await this.prisma.conTenantResuelto(
      tenantId,
      (tx) =>
        tx.$queryRaw`
        UPDATE mensajes
           SET envio_reservado_en = NULL, actualizado_en = now()
         WHERE tenant_id = ${tenantId}::uuid AND id = ${mensajeId}::uuid
           AND direccion = 'SALIENTE' AND wamid IS NULL`,
    );
  }
}
