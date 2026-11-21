/**
 * `GET /api/v1/reportes/resumen?desde=&hasta=&asesorId=` — los agregados de un periodo.
 *
 * **No exige ningún permiso para entrar**: cualquier miembro ve LO SUYO. Lo que decide qué filas
 * entran es `reportes.ver_agencia`, y lo resuelve el servidor sobre la sesión (`alcanceDeReporte`,
 * ADR-0035 §1 y §4): sin el permiso la respuesta es de alcance `PROPIO` con el asesor de la
 * sesión, y un `asesorId` ajeno responde 403 en vez de recortarse en silencio.
 *
 * Esto RETIRA el gate provisional de #395, que exigía `conversaciones.ver_todas` y dejaba al
 * asesor sin reportes: ese permiso es «qué chats superviso», no «qué cifras de venta veo».
 *
 * El neto y el margen salen además solo con `cotizacion.ver_neto_y_margen`, y sin él las claves no
 * existen: alcance y margen son dos ejes distintos (§6). Lo mismo con `porCobrar` y `cobro.ver`
 * (T-537), el permiso que ya exigen las pantallas de cobro: un reporte nunca enseña más que ellas
 * (§4). El tenant lo pone el middleware desde la sesión, no aparece en ninguna firma.
 *
 * **Por qué el permiso NO va en un `@RequierePermiso` de la ruta:** eso dejaría sin NINGÚN reporte
 * a quien no puede ver cobros. Lo que se recorta es la clave, no la entrada, igual que el margen.
 */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ConsultarResumenDeReportes, type ResumenDeReportesPorAlcance } from '@viajapro/contracts';
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
  ): Promise<ResumenDeReportesPorAlcance> {
    return this.resumen.ejecutar(consulta);
  }
}
