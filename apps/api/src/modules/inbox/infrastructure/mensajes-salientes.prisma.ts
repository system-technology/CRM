/**
 * El mensaje saliente en la base, del lado del trabajador (rol `viajapro_webhook`), siempre bajo
 * el tenant del trabajo y por tanto bajo RLS: un `mensajeId` de otra agencia no existe aquí.
 *
 * Cada método es UNA transacción corta, y ninguna contiene la llamada a Meta: el caso de uso lee,
 * cierra, llama y vuelve a abrir para escribir (AGENTS.md §5). Las escrituras son condicionales
 * (`wamid IS NULL`, `estado = 'PENDIENTE'`) para que un webhook de estado que llegue antes que la
 * respuesta del envío no se pise.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaWebhookService } from '../../../shared/prisma/prisma-webhook.service.js';
import { type MensajePorEnviar, PuertoMensajesSalientes } from '../application/puertos-de-envio.js';
import type { ErrorDeEnvioWhatsapp } from '../domain/errores-de-envio.js';
import { TIPO_MENSAJE_ACTUALIZADO } from '../domain/evento-de-dominio.js';

@Injectable()
export class MensajesSalientesPrisma extends PuertoMensajesSalientes {
  constructor(@Inject(PrismaWebhookService) private readonly prisma: PrismaWebhookService) {
    super();
  }

  async leerParaEnviar(tenantId: string, mensajeId: string): Promise<MensajePorEnviar | null> {
    const fila = await this.prisma.conTenantResuelto(tenantId, (tx) =>
      tx.mensaje.findFirst({
        where: { id: mensajeId, tenantId, direccion: 'SALIENTE', eliminadoEn: null },
        select: {
          id: true,
          conversacionId: true,
          estado: true,
          wamid: true,
          tipo: true,
          texto: true,
          conversacion: {
            select: {
              ultimoMensajeClienteEn: true,
              // Solo lectura del teléfono por la relación, como ya hace `mapeo.ts`.
              contacto: { select: { telefonoE164: true } },
              canal: {
                select: { id: true, phoneNumberId: true, estado: true, eliminadoEn: true },
              },
            },
          },
        },
      }),
    );
    if (!fila) return null;
    const { canal } = fila.conversacion;
    return {
      mensajeId: fila.id,
      conversacionId: fila.conversacionId,
      estado: fila.estado,
      aceptadoPorMeta: fila.wamid !== null,
      tipo: fila.tipo,
      texto: fila.texto,
      destinoE164: fila.conversacion.contacto.telefonoE164,
      canalId: canal.id,
      phoneNumberId: canal.phoneNumberId,
      canalActivo: canal.estado === 'ACTIVO' && canal.eliminadoEn === null,
      ultimoMensajeClienteEn: fila.conversacion.ultimoMensajeClienteEn,
    };
  }

  async registrarAceptado(tenantId: string, mensajeId: string, wamid: string): Promise<void> {
    await this.prisma.conTenantResuelto(tenantId, (tx) =>
      tx.mensaje.updateMany({
        where: { id: mensajeId, tenantId, direccion: 'SALIENTE', wamid: null },
        // El estado no cambia: «aceptado» no es «enviado». Lo mueve el webhook `sent`.
        data: { wamid },
      }),
    );
  }

  async registrarFallo(
    tenantId: string,
    mensajeId: string,
    error: Pick<ErrorDeEnvioWhatsapp, 'codigoMeta' | 'message'>,
  ): Promise<boolean> {
    return this.prisma.conTenantResuelto(tenantId, async (tx) => {
      const r = await tx.mensaje.updateMany({
        where: {
          id: mensajeId,
          tenantId,
          direccion: 'SALIENTE',
          estado: 'PENDIENTE',
          wamid: null,
        },
        data: {
          estado: 'FALLIDO',
          codigoErrorMeta: error.codigoMeta,
          motivoFallo: error.message.slice(0, 500),
        },
      });
      if (r.count !== 1) return false;
      const m = await tx.mensaje.findFirstOrThrow({
        where: { id: mensajeId, tenantId },
        select: { conversacionId: true },
      });
      await tx.outbox.create({
        data: {
          tenantId,
          agregado: 'mensaje',
          agregadoId: mensajeId,
          tipoEvento: TIPO_MENSAJE_ACTUALIZADO,
          payload: { conversacionId: m.conversacionId },
        },
      });
      return true;
    });
  }
}
