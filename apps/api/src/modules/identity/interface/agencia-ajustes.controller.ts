/**
 * `GET   /api/v1/agencia/ajustes`: cualquier miembro autenticado de la agencia activa.
 * `PATCH /api/v1/agencia/ajustes`: cambia la zona horaria y/o el RNT; exige `usuarios.administrar`
 * (dueño y administradores). No hay un permiso `agencia.*` en el catálogo y crearlo exige migración.
 */
import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { CambiarAjustesDeAgencia, type AjustesDeAgencia } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { AjustesDeAgenciaUseCase } from '../application/ajustes-de-agencia.use-case.js';

@Controller('api/v1/agencia/ajustes')
export class AgenciaAjustesController {
  constructor(@Inject(AjustesDeAgenciaUseCase) private readonly ajustes: AjustesDeAgenciaUseCase) {}

  @Get()
  obtener(): Promise<AjustesDeAgencia> {
    return this.ajustes.obtener();
  }

  @Patch()
  @RequierePermiso('usuarios.administrar')
  actualizar(
    @Body(new ZodValidationPipe(CambiarAjustesDeAgencia)) body: CambiarAjustesDeAgencia,
  ): Promise<AjustesDeAgencia> {
    return this.ajustes.actualizar(body);
  }
}
