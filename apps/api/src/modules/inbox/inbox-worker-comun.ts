/**
 * Lo que el contexto del TRABAJADOR del inbox necesita sea cual sea el modo de despliegue
 * (ADR-0019): el caso de uso, los adaptadores de base de datos y el cliente de WhatsApp. Lo que
 * cambia entre `escalado` (BullMQ y Redis, `inbox-worker.module.ts`) y `unico` (colas en proceso,
 * `inbox-worker-unico.module.ts`) son las colas, el bus y los planificadores.
 *
 * Es el único sitio donde se construye `PrismaWebhookService` (rol `viajapro_webhook`): la API no
 * lo importa nunca (R2, ADR-0010 Parte 2, condición 1).
 */
import type { Provider } from '@nestjs/common';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { BarrerPendientes } from './application/barrer-pendientes.js';
import { EnviarMensajeSaliente } from './application/enviar-mensaje-saliente.js';
import { ProcesarChange } from './application/procesar-change.js';
import { RelevarOutbox } from './application/relevar-outbox.js';
import { PuertoPendientes } from './application/puertos-de-barrido.js';
import { PuertoOutbox } from './application/puertos-de-eventos.js';
import {
  PuertoCredencialesWhatsapp,
  PuertoEnvioWhatsapp,
  PuertoMensajesSalientes,
} from './application/puertos-de-envio.js';
import { PuertoBandeja, PuertoStaging } from './application/puertos-de-proceso.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import {
  crearCredencialesWhatsapp,
  crearEnvioWhatsapp,
} from './infrastructure/crear-envio-whatsapp.js';
import { MensajesSalientesPrisma } from './infrastructure/mensajes-salientes.prisma.js';
import { OutboxPrisma } from './infrastructure/outbox.prisma.js';
import { PendientesPrisma } from './infrastructure/pendientes.prisma.js';
import { StagingPrisma } from './infrastructure/staging.prisma.js';

export const PROVEEDORES_COMUNES_DEL_TRABAJADOR: Provider[] = [
  PrismaWebhookService,
  ProcesarChange,
  BarrerPendientes,
  // --- Relay del outbox: de la base al bus, sin saber que existen sockets ---
  RelevarOutbox,
  { provide: PuertoOutbox, useClass: OutboxPrisma },
  { provide: PuertoPendientes, useClass: PendientesPrisma },
  { provide: PuertoStaging, useClass: StagingPrisma },
  { provide: PuertoBandeja, useClass: BandejaPrisma },
  // --- Envío saliente por WhatsApp (ADR-0018): el relay encola, un consumidor envía ---
  EnviarMensajeSaliente,
  { provide: PuertoMensajesSalientes, useClass: MensajesSalientesPrisma },
  { provide: PuertoEnvioWhatsapp, useFactory: (): PuertoEnvioWhatsapp => crearEnvioWhatsapp() },
  {
    provide: PuertoCredencialesWhatsapp,
    useFactory: (): PuertoCredencialesWhatsapp => crearCredencialesWhatsapp(),
  },
];
