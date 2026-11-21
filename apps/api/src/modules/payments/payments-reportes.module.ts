/**
 * El puerto de `payments` hacia `analytics` (T-528), en su propio módulo y no en `PaymentsModule`,
 * por la misma razón que `CrmReportesModule`: `analytics` inyecta el símbolo sin importar
 * `payments` (R4), y `@Global()` evita el import cruzado.
 *
 * Solo lo monta la API: necesita `PrismaService` (rol `viajapro_app`) y el puerto hacia `booking`.
 */
import { Global, Module } from '@nestjs/common';
import { PuertoCobrosParaReportes } from '../../shared/puertos/puertos-de-reportes.js';
import { CobrosParaReportesPrisma } from './infrastructure/cobros-para-reportes.prisma.js';

@Global()
@Module({
  providers: [{ provide: PuertoCobrosParaReportes, useClass: CobrosParaReportesPrisma }],
  exports: [PuertoCobrosParaReportes],
})
export class PaymentsReportesModule {}
