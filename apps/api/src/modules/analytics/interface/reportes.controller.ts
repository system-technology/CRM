/**
 * `GET /api/v1/reportes/resumen?desde=&hasta=` — los agregados de un periodo.
 *
 * Exige `conversaciones.ver_todas` (D3: «el asesor ve lo suyo, el administrador todo»; el resumen
 * es de toda la agencia). El neto y el margen salen además solo con
 * `cotizacion.ver_neto_y_margen`, y sin él las claves no existen. El tenant lo
 * pone el middleware desde la sesión, no aparece en ninguna firma.
 */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ConsultarResumenDeReportes, type ResumenDeReportes } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { PERMISO_VER_TODAS } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { ObtenerResumenDeReportes } from '../application/obtener-resumen.use-case.js';

@Controller('api/v1/reportes')
export class ReportesController {
  constructor(
    @Inject(ObtenerResumenDeReportes) private readonly resumen: ObtenerResumenDeReportes,
  ) {}

  // PROVISIONAL (D3, H1): hoy el resumen es de toda la agencia y no hay «propio»; sin
  // `conversaciones.ver_todas` es 403. T-342 retira este gate (T-341 solo crea el permiso `reportes.ver_agencia`; ADR-0035 §7).
  @RequierePermiso(PERMISO_VER_TODAS)
  @Get('resumen')
  async obtener(
    @Query(new ZodValidationPipe(ConsultarResumenDeReportes)) consulta: ConsultarResumenDeReportes,
  ): Promise<ResumenDeReportes> {
    return this.resumen.ejecutar(consulta);
  }
}
