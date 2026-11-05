/**
 * Las dos raíces de Nest del modo `unico` (ADR-0019 §1.1). Son dos CONTENEDORES de inyección
 * distintos dentro del mismo proceso:
 *
 *   · `ApiUnicoModule`: `AppModule` (HTTP, Socket.IO, webhook) con `PrismaService` y los demás
 *     pools de la API. No contiene `PrismaWebhookService`: ningún controlador puede inyectarlo.
 *   · `TrabajadorUnicoModule`: el trabajo asíncrono, con SU pool (`viajapro_webhook`) y su
 *     aserción de rol al arrancar.
 *
 * Lo único que cruza es `CompartidoDelInbox` (bus, avisos y cola de changes, todo en memoria).
 */
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { CrmPuertosModule } from '../modules/crm/crm-puertos.module.js';
import { InboxWorkerUnicoModule } from '../modules/inbox/inbox-worker-unico.module.js';
import {
  COMPARTIDO_DEL_INBOX,
  type CompartidoDelInbox,
} from '../modules/inbox/infrastructure/compartido-en-proceso.js';

@Global()
@Module({})
export class CompartidoEnProcesoModule {
  static forRoot(compartido: CompartidoDelInbox): DynamicModule {
    return {
      module: CompartidoEnProcesoModule,
      providers: [{ provide: COMPARTIDO_DEL_INBOX, useValue: compartido }],
      exports: [COMPARTIDO_DEL_INBOX],
    };
  }
}

@Module({})
export class ApiUnicoModule {
  static forRoot(compartido: CompartidoDelInbox): DynamicModule {
    return {
      module: ApiUnicoModule,
      imports: [CompartidoEnProcesoModule.forRoot(compartido), AppModule],
    };
  }
}

@Module({})
export class TrabajadorUnicoModule {
  static forRoot(compartido: CompartidoDelInbox): DynamicModule {
    return {
      module: TrabajadorUnicoModule,
      // Sin `NotificationsWorkerModule`: el correo sale por su cola en proceso, en el contexto HTTP.
      imports: [CrmPuertosModule, InboxWorkerUnicoModule.forRoot(compartido)],
    };
  }
}
