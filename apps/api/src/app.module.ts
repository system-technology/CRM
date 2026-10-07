import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { QuotingModule } from './modules/quoting/quoting.module.js';
import { SaludController } from './salud.controller.js';
import { SharedModule } from './shared/shared.module.js';
import { TenantMiddleware } from './shared/tenant/tenant.middleware.js';

@Module({
  imports: [SharedModule, QuotingModule],
  controllers: [SaludController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // A TODAS las rutas. El middleware decide internamente cuáles van sin tenant
    // (salud, webhooks, autenticación). Excluir rutas aquí deja huecos que se olvidan.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
