/**
 * Miembros de la agencia (ADR-0011, rebanada 4).
 *
 *   POST /api/v1/identidad/miembros/:id/baja   el dueño da de baja a un miembro
 *
 * Responde `{ ok: true }`. El `:id` es el de `usuarios` (la pertenencia a ESTA agencia), nunca el
 * de la identidad global: bajo RLS, uno de otra agencia no existe y responde 404.
 */
import { Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { RespuestaOk } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { DarDeBajaMiembroUseCase } from '../application/dar-de-baja-miembro.use-case.js';

@Controller('api/v1/identidad/miembros')
export class MiembrosController {
  constructor(@Inject(DarDeBajaMiembroUseCase) private readonly baja: DarDeBajaMiembroUseCase) {}

  @Post(':id/baja')
  @HttpCode(200)
  @RequierePermiso('usuarios.administrar')
  async darDeBaja(@Param('id', ParseUUIDPipe) id: string): Promise<RespuestaOk> {
    await this.baja.ejecutar(id);
    return { ok: true };
  }
}
