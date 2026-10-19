/**
 * Lista los changes pendientes con `listar_changes_pendientes`, que el rol `viajapro_webhook`
 * tiene concedida y que valida el rango del límite en la propia base (1 a 1000).
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import { type ChangePendiente, PuertoPendientes } from '../application/puertos-de-barrido.js';

@Injectable()
export class PendientesPrisma extends PuertoPendientes {
  constructor(@Inject(PrismaWebhookService) private readonly prisma: PrismaWebhookService) {
    super();
  }

  async listar(antiguedadMinimaS: number, limite: number): Promise<ChangePendiente[]> {
    const filas = await this.prisma.$queryRaw<
      Array<{ recepcion_id: Buffer; indice: number; antiguedad_s: number }>
    >`SELECT recepcion_id, indice, antiguedad_s
        FROM public.listar_changes_pendientes(${antiguedadMinimaS}::integer, ${limite}::integer)`;
    return filas.map((f) => ({
      recepcionId: f.recepcion_id,
      indice: f.indice,
      antiguedadS: f.antiguedad_s,
    }));
  }
}
