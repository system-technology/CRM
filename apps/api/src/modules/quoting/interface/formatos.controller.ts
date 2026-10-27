/**
 * Formatos de viaje de la agencia (ADR-0017 §4.2).
 *
 * - `GET   /api/v1/catalogo/formatos`                  lista (catalogo.administrar)
 * - `POST  /api/v1/catalogo/formatos`                  crea (201)
 * - `PATCH /api/v1/catalogo/formatos/:id`              edita o desactiva
 * - `GET   /api/v1/catalogo/formatos/:id/plantilla`    `DescriptorDePlantilla` para generar la hoja
 *
 * No hay DELETE: un formato en uso se desactiva. El tenant sale de la sesión, nunca del cuerpo.
 */

import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CrearFormatoDeViaje,
  type DescriptorDePlantilla,
  EditarFormatoDeViaje,
  type FormatoDeViaje,
} from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { FormatosUseCase } from '../application/formatos.use-case.js';

@Controller('api/v1/catalogo/formatos')
export class FormatosController {
  constructor(@Inject(FormatosUseCase) private readonly formatos: FormatosUseCase) {}

  @Get()
  @RequierePermiso('catalogo.administrar')
  listar(): Promise<{ datos: FormatoDeViaje[] }> {
    return this.formatos.listar();
  }

  @Post()
  @RequierePermiso('catalogo.administrar')
  crear(
    @Body(new ZodValidationPipe(CrearFormatoDeViaje)) body: CrearFormatoDeViaje,
  ): Promise<FormatoDeViaje> {
    return this.formatos.crear(body);
  }

  @Patch(':id')
  @RequierePermiso('catalogo.administrar')
  editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(EditarFormatoDeViaje)) body: EditarFormatoDeViaje,
  ): Promise<FormatoDeViaje> {
    return this.formatos.editar(id, body);
  }

  @Get(':id/plantilla')
  @RequierePermiso('catalogo.administrar')
  plantilla(@Param('id', new ParseUUIDPipe()) id: string): Promise<DescriptorDePlantilla> {
    return this.formatos.plantilla(id);
  }
}
