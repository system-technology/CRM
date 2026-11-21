/**
 * El catálogo de etiquetas de la agencia por HTTP (T-325). Validación con los esquemas de
 * `@viajapro/contracts` (R3); el tenant sale de la sesión (middleware), nunca de la ruta ni del
 * cuerpo. Leer: cualquier usuario de la agencia. Crear, renombrar, recolorear, ordenar y borrar:
 * `etiquetas.administrar`. Una etiqueta de otra agencia responde `404 ETIQUETA_NO_ENCONTRADA`,
 * igual que un id que no existe. El id mal formado es un `400` y no revela nada.
 *
 * Poner y quitar una etiqueta en una conversación vive en `ConversacionesController`
 * (`bandeja.operar`).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ActualizarEtiquetaCuerpo,
  CrearEtiquetaCuerpo,
  type Etiqueta,
  type ListaDeEtiquetas,
  type RespuestaOk,
} from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { GestionarEtiquetasUseCase } from '../application/gestionar-etiquetas.js';

@Controller('api/v1/etiquetas')
export class EtiquetasController {
  constructor(
    @Inject(GestionarEtiquetasUseCase) private readonly etiquetas: GestionarEtiquetasUseCase,
  ) {}

  @Get()
  listar(): Promise<ListaDeEtiquetas> {
    return this.etiquetas.listar();
  }

  /** `409 ETIQUETA_DUPLICADA` si el nombre normalizado ya existe; `422` al pasar el tope de 50. */
  @RequierePermiso('etiquetas.administrar')
  @Post()
  @HttpCode(201)
  crear(
    @Body(new ZodValidationPipe(CrearEtiquetaCuerpo)) cuerpo: CrearEtiquetaCuerpo,
  ): Promise<Etiqueta> {
    return this.etiquetas.crear(cuerpo);
  }

  /** Renombrar, recolorear u ordenar. Conserva las asignaciones (van por id). */
  @RequierePermiso('etiquetas.administrar')
  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ActualizarEtiquetaCuerpo)) cuerpo: ActualizarEtiquetaCuerpo,
  ): Promise<Etiqueta> {
    return this.etiquetas.actualizar(id, cuerpo);
  }

  /** Borrado físico: se lleva sus asignaciones. No se puede deshacer. */
  @RequierePermiso('etiquetas.administrar')
  @Delete(':id')
  async borrar(@Param('id', ParseUUIDPipe) id: string): Promise<RespuestaOk> {
    await this.etiquetas.borrar(id);
    return { ok: true };
  }
}
