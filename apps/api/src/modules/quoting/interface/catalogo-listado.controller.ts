/**
 * Listado de gestión del catálogo (ADR-0017 §4.1): `GET /api/v1/catalogo/paquetes`.
 *
 * Exige `catalogo.administrar`. Es otra ruta que `GET /api/v1/paquetes` (el catálogo que consulta
 * el asesor al cotizar): esta admite desactivados y trae el «desde» derivado. El tenant sale de la
 * sesión; los parámetros se validan con el esquema de `@viajapro/contracts` (R3).
 */

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ParametrosListadoGestion } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import {
  ListarPaquetesGestionUseCase,
  type PaginaDeGestion,
} from '../application/listar-paquetes-gestion.use-case.js';

@Controller('api/v1/catalogo/paquetes')
export class CatalogoListadoController {
  // `@Inject` explícito: ver la nota de `catalogo.controller.ts`.
  constructor(
    @Inject(ListarPaquetesGestionUseCase)
    private readonly listarGestion: ListarPaquetesGestionUseCase,
  ) {}

  @Get()
  @RequierePermiso('catalogo.administrar')
  async listar(
    @Query(new ZodValidationPipe(ParametrosListadoGestion)) params: ParametrosListadoGestion,
  ): Promise<PaginaDeGestion> {
    return this.listarGestion.ejecutar(params);
  }
}
