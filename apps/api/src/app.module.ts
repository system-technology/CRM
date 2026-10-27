import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CrmModule } from './modules/crm/crm.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { InboxModule } from './modules/inbox/inbox.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { QuotingModule } from './modules/quoting/quoting.module.js';
import { SaludController } from './salud.controller.js';
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
    NotificationsModule,
    IdentityModule,
    QuotingModule,
    InboxModule,
    CrmModule,
  ],
  controllers: [SaludController],
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
