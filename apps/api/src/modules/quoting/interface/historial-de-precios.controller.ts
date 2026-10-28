/** `GET /api/v1/catalogo/tarifas/:id/historial` (ADR-0017 §4.1 y §8, T-047). Exige `catalogo.administrar`. */

import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ConsultaHistorialDePrecios } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { HistorialDePreciosUseCase } from '../application/historial-de-precios.use-case.js';

@Controller('api/v1/catalogo')
export class HistorialDePreciosController {
  constructor(
    @Inject(HistorialDePreciosUseCase) private readonly historial: HistorialDePreciosUseCase,
  ) {}

  @Get('tarifas/:id/historial')
  @RequierePermiso('catalogo.administrar')
  listar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(ConsultaHistorialDePrecios)) consulta: ConsultaHistorialDePrecios,
  ) {
    return this.historial.ejecutar(
      id,
      consulta,
      ContextoTenant.tienePermiso('cotizacion.ver_neto_y_margen'),
    );
  }
}
