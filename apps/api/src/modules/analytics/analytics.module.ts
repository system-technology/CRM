import { Module } from '@nestjs/common';
import { ObtenerResumenDeReportes } from './application/obtener-resumen.use-case.js';
import { ReportesController } from './interface/reportes.controller.js';

/**
 * Contexto de analítica: reportes. No tiene tablas ni acceso a Prisma: pide agregados a `quoting`,
 * `crm` e `inbox` por los puertos de `shared/puertos/puertos-de-reportes.ts` (R4).
 */
@Module({
  controllers: [ReportesController],
  providers: [ObtenerResumenDeReportes],
})
export class AnalyticsModule {}
