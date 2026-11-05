/**
 * Miembros de la agencia (ADR-0011, rebanada 4).
 *
 *   GET  /api/v1/identidad/miembros            lista los miembros de la agencia (T-121)
 *   POST /api/v1/identidad/miembros/:id/baja   el dueño da de baja a un miembro
 *
 * Responde `{ ok: true }`. El `:id` es el de `usuarios` (la pertenencia a ESTA agencia), nunca el
 * de la identidad global: bajo RLS, uno de otra agencia no existe y responde 404.
 */
import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { ListaDeMiembros, RespuestaOk } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ListarMiembrosUseCase } from '../application/listar-miembros.use-case.js';
import { DarDeBajaMiembroUseCase } from '../application/dar-de-baja-miembro.use-case.js';

@Controller('api/v1/identidad/miembros')
export class MiembrosController {
  constructor(
    @Inject(DarDeBajaMiembroUseCase) private readonly baja: DarDeBajaMiembroUseCase,
    @Inject(ListarMiembrosUseCase) private readonly listado: ListarMiembrosUseCase,
  ) {}

  @Get()
  @RequierePermiso('usuarios.administrar')
  async listar(): Promise<ListaDeMiembros> {
    return this.listado.ejecutar();
  }

  @Post(':id/baja')
  @HttpCode(200)
  @RequierePermiso('usuarios.administrar')
  async darDeBaja(@Param('id', ParseUUIDPipe) id: string): Promise<RespuestaOk> {
    await this.baja.ejecutar(id);
    return { ok: true };
  }
}
