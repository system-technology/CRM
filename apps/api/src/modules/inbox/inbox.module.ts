/**
 * Contexto delimitado `inbox`: la bandeja de conversaciones de WhatsApp.
 *
 * Hoy solo expone el webhook. El resto —persistencia de mensajes, resolución de tenant,
 * publicación a la cola— entra cuando exista la función `registrar_recepcion` del ADR-0008 §4.
 *
 * No importa ningún otro módulo de negocio, ni lo hará: R4.
 */

import { Module } from '@nestjs/common';
import { PuertoRecepciones } from './application/puerto-recepciones.js';
import { PuertoColaDeChanges } from './application/puertos-de-proceso.js';
import { ColaDeChangesBullmq } from './infrastructure/cola-de-changes.bullmq.js';
import { ColaDeChangesInerte } from './infrastructure/cola-de-changes.inerte.js';
import { RegistrarRecepcion } from './application/registrar-recepcion.js';
import { RecepcionesPrisma } from './infrastructure/recepciones.prisma.js';
import { WebhookWhatsappController } from './interface/webhook-whatsapp.controller.js';

@Module({
  controllers: [WebhookWhatsappController],
  providers: [
    RegistrarRecepcion,
    { provide: PuertoRecepciones, useClass: RecepcionesPrisma },
    {
      // Cola explícita, sin respaldo silencioso: o hay Redis o se declara 'inerte'.
      provide: PuertoColaDeChanges,
      useFactory: (): PuertoColaDeChanges => {
        if (process.env['COLA_CHANGES'] === 'inerte') return new ColaDeChangesInerte();
        const url = process.env['REDIS_URL'];
        if (!url) throw new Error('Falta REDIS_URL (o COLA_CHANGES=inerte en desarrollo).');
        return new ColaDeChangesBullmq(url);
      },
    },
  ],
})
export class InboxModule {}
