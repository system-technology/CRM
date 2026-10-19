/**
 * Adaptador del staging y del directorio. Solo llama a las funciones `SECURITY DEFINER` que el
 * rol `viajapro_webhook` tiene concedidas: ninguna tabla se toca directamente.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import {
  type ChangeTomado,
  type EnrutamientoResuelto,
  PuertoStaging,
} from '../application/puertos-de-proceso.js';

@Injectable()
export class StagingPrisma extends PuertoStaging {
  constructor(@Inject(PrismaWebhookService) private readonly prisma: PrismaWebhookService) {
    super();
  }

  async tomar(recepcionId: Buffer, indice: number): Promise<ChangeTomado | null> {
    const filas = await this.prisma.$queryRaw<
      Array<{
        payload_cifrado: Buffer | null;
        payload_nonce: Buffer | null;
        payload_tag: Buffer | null;
        clave_version: number;
        estado: ChangeTomado['estado'];
      }>
    >`SELECT payload_cifrado, payload_nonce, payload_tag, clave_version, estado::text AS estado
        FROM public.tomar_recepcion(${recepcionId}::bytea, ${indice}::smallint)`;
    const f = filas[0];
    if (!f) return null;
    return {
      cifrado: f.payload_cifrado,
      nonce: f.payload_nonce,
      tag: f.payload_tag,
      claveVersion: f.clave_version,
      estado: f.estado,
    };
  }

  async resolver(clave: Buffer): Promise<EnrutamientoResuelto | null> {
    const filas = await this.prisma.$queryRaw<
      Array<{ tenant_resuelto_id: string; canal_id: string | null; estado: string }>
    >`SELECT tenant_resuelto_id, canal_id, estado::text AS estado
        FROM public.resolver_enrutamiento(${clave}::bytea)`;
    const f = filas[0];
    if (!f) return null;
    return {
      tenantId: f.tenant_resuelto_id,
      canalId: f.canal_id,
      estado: f.estado as EnrutamientoResuelto['estado'],
    };
  }

  async cerrar(
    recepcionId: Buffer,
    indice: number,
    estado: 'PROCESADO' | 'CLASIFICADO',
  ): Promise<void> {
    // Incondicional: la condición «¿era el último?» la resuelve la función en una sentencia.
    await this.prisma.$queryRaw`
      SELECT public.anular_payload(${recepcionId}::bytea, ${indice}::smallint,
                                   ${estado}::public.estado_change_recepcion)`;
  }
}
