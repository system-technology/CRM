/**
 * `GET /api/v1/reportes/resumen?desde=&hasta=` — los agregados de un periodo.
 *
 * Cualquier miembro de la agencia lo lee (es lo que ya ve en el tablero); el neto y el margen
 * salen solo con `cotizacion.ver_neto_y_margen`, y sin él las claves no existen. El tenant lo
 * pone el middleware desde la sesión, no aparece en ninguna firma.
 */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ConsultarResumenDeReportes, type ResumenDeReportes } from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { ObtenerResumenDeReportes } from '../application/obtener-resumen.use-case.js';

@Controller('api/v1/reportes')
export class ReportesController {
  constructor(
    @Inject(ObtenerResumenDeReportes) private readonly resumen: ObtenerResumenDeReportes,
  ) {}

  @Get('resumen')
  async obtener(
    @Query(new ZodValidationPipe(ConsultarResumenDeReportes)) consulta: ConsultarResumenDeReportes,
  ): Promise<ResumenDeReportes> {
    return this.resumen.ejecutar(consulta);
  }
}
