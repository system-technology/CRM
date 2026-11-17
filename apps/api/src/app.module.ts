import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { CrmReportesModule } from './modules/crm/crm-reportes.module.js';
import { CrmModule } from './modules/crm/crm.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { InboxModule } from './modules/inbox/inbox.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { QuotingPuertosModule } from './modules/quoting/quoting-puertos.module.js';
import { QuotingModule } from './modules/quoting/quoting.module.js';
import { SaludController } from './salud.controller.js';
import { comprobacionDeClavesDeLaApi } from './shared/cifrado/comprobacion-al-arrancar.js';
import { PrismaService } from './shared/prisma/prisma.service.js';
import { LectorDeCola, LectorDeColaRedis } from './shared/observabilidad/antiguedad-de-cola.js';
import {
  LectorDelLatido,
  LectorDelLatidoRedis,
  seExigeElLatido,
} from './shared/salud/latido-del-trabajador.js';
import { EventosDeDominioModule } from './shared/eventos/eventos-de-dominio.module.js';
import { SharedModule } from './shared/shared.module.js';
import { TenantMiddleware } from './shared/tenant/tenant.middleware.js';
import {
  LimiteDeTasaPorIpMiddleware,
  LimiteDeTasaPorTenantMiddleware,
} from './shared/red/limite-de-tasa/limite-de-tasa.middleware.js';
import { OriginCheckMiddleware } from './shared/red/origin-check.middleware.js';

@Module({
  imports: [
    SharedModule,
    // ADR-0024 §1: el despacho de eventos de dominio vive en el contenedor de la API (unico y escalado).
    EventosDeDominioModule,
    NotificationsModule,
    IdentityModule,
    QuotingModule,
    QuotingPuertosModule,
    InboxModule,
    CrmModule,
    CrmReportesModule,
    AnalyticsModule,
    BookingModule,
  ],
  controllers: [SaludController],
  providers: [
    // T-234: en la raíz, su `onModuleInit` corre tras el de los servicios Prisma (rol verificado) y
    // antes de cualquier `onApplicationBootstrap` (consumidores y planificadores).
    comprobacionDeClavesDeLaApi(PrismaService),
    {
      // T-203: antigüedad de la cola, medida por el trabajador y publicada en Redis.
      provide: LectorDeCola,
      useFactory: (): LectorDeCola | null =>
        seExigeElLatido() ? new LectorDeColaRedis(process.env['REDIS_URL'] ?? '') : null,
    },
    {
      // T-194: la API lee el latido del trabajador. `null` donde no hay trabajador aparte.
      provide: LectorDelLatido,
      useFactory: (): LectorDelLatido | null =>
        seExigeElLatido() ? new LectorDelLatidoRedis(process.env['REDIS_URL'] ?? '') : null,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 1. Origin check PRIMERO: valida Origin en mutaciones ANTES de tocar BD
    consumer.apply(OriginCheckMiddleware).forRoutes('*');

    // 1b. Límite de tasa por IP (T-002): antes de resolver la sesión, que consulta la base.
    consumer.apply(LimiteDeTasaPorIpMiddleware).forRoutes('*');

    // 2. Tenant middleware: establece contexto de tenant (respeta rutas sin tenant)
    // A TODAS las rutas. El middleware decide internamente cuáles van sin tenant
    // (salud, webhooks, autenticación). Excluir rutas aquí deja huecos que se olvidan.
    consumer.apply(TenantMiddleware).forRoutes('*');

    // 3. Límite de tasa por agencia (T-002): necesita el tenant que fijó el paso anterior.
    consumer.apply(LimiteDeTasaPorTenantMiddleware).forRoutes('*');
  }
}
