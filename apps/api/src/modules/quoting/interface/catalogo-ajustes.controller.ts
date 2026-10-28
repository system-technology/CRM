/**
 * Ajustes de catálogo de la agencia (ADR-0017 §9): `GET` y `PATCH /api/v1/catalogo/ajustes`.
 * Exigen `catalogo.administrar` y operan siempre sobre el tenant de la sesión: no hay `tenantId`
 * en la ruta ni en el cuerpo, y el esquema es `.strict()`.
 */

import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ActualizarAjustesDeCatalogo } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { AjustesDeCatalogoUseCase } from '../application/ajustes-de-catalogo.use-case.js';

@Controller('api/v1/catalogo/ajustes')
export class CatalogoAjustesController {
  // `@Inject` explícito: ver la nota de `catalogo.controller.ts`.
  constructor(
    @Inject(AjustesDeCatalogoUseCase) private readonly ajustes: AjustesDeCatalogoUseCase,
  ) {}

  @Get()
  @RequierePermiso('catalogo.administrar')
  obtener() {
    return this.ajustes.obtener();
  }

  @Patch()
  @RequierePermiso('catalogo.administrar')
  actualizar(
    @Body(new ZodValidationPipe(ActualizarAjustesDeCatalogo)) body: ActualizarAjustesDeCatalogo,
  ) {
    return this.ajustes.actualizar(body);
  }
}
