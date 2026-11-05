/** `GET /api/v1/agencia/ajustes`: cualquier miembro autenticado de la agencia activa. */
import { Controller, Get, Inject } from '@nestjs/common';
import type { AjustesDeAgencia } from '@viajapro/contracts';
import { AjustesDeAgenciaUseCase } from '../application/ajustes-de-agencia.use-case.js';

@Controller('api/v1/agencia/ajustes')
export class AgenciaAjustesController {
  constructor(@Inject(AjustesDeAgenciaUseCase) private readonly ajustes: AjustesDeAgenciaUseCase) {}

  @Get()
  obtener(): Promise<AjustesDeAgencia> {
    return this.ajustes.obtener();
  }
}
