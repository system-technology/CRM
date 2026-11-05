/**
 * El puerto de `crm` hacia `analytics`, en su propio módulo y no en `CrmPuertosModule`: ese lo
 * importa también el trabajador, que no tiene `PrismaService` (rol `viajapro_app`). Este solo lo
 * monta la API. `@Global()` por la misma razón que los demás: `analytics` inyecta el símbolo sin
 * importar `crm` (R4).
 */
import { Global, Module } from '@nestjs/common';
import { PuertoOportunidadesParaReportes } from '../../shared/puertos/puertos-de-reportes.js';
import { OportunidadesParaReportesPrisma } from './infrastructure/oportunidades-para-reportes.prisma.js';

@Global()
@Module({
  providers: [
    { provide: PuertoOportunidadesParaReportes, useClass: OportunidadesParaReportesPrisma },
  ],
  exports: [PuertoOportunidadesParaReportes],
})
export class CrmReportesModule {}
