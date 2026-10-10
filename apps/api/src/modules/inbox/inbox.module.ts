/**
 * Contexto delimitado `inbox`: la bandeja de conversaciones de WhatsApp.
 *
 * Hoy solo expone el webhook. El resto —persistencia de mensajes, resolución de tenant,
 * publicación a la cola— entra cuando exista la función `registrar_recepcion` del ADR-0008 §4.
 *
 * No importa ningún otro módulo de negocio, ni lo hará: R4.
 */

import { Module } from '@nestjs/common';
import { WebhookWhatsappController } from './interface/webhook-whatsapp.controller.js';

@Module({
  controllers: [WebhookWhatsappController],
})
export class InboxModule {}
