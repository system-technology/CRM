/**
 * Miembros de la agencia (ADR-0011, rebanada 4).
 *
 *   GET  /api/v1/identidad/miembros            lista los miembros de la agencia (T-121)
 *   GET  /api/v1/identidad/miembros/asignables id y nombre de a quién asignar (ADR-0022)
 *   POST /api/v1/identidad/miembros/:id/baja   el dueño da de baja a un miembro
 *   PATCH /api/v1/identidad/miembros/:id/apodo fija o quita el apodo de ingreso (ADR-0031)
 *
 * Responde `{ ok: true }`. El `:id` es el de `usuarios` (la pertenencia a ESTA agencia), nunca el
 * de la identidad global: bajo RLS, uno de otra agencia no existe y responde 404.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CambiarApodo,
  type ListaDeMiembros,
  type ListaDeMiembrosAsignables,
  type RespuestaOk,
} from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { CambiarApodoDeMiembroUseCase } from '../application/cambiar-apodo-de-miembro.use-case.js';
import { ListarMiembrosAsignablesUseCase } from '../application/listar-miembros-asignables.use-case.js';
import { ListarMiembrosUseCase } from '../application/listar-miembros.use-case.js';
import { DarDeBajaMiembroUseCase } from '../application/dar-de-baja-miembro.use-case.js';

@Controller('api/v1/identidad/miembros')
export class MiembrosController {
  constructor(
    @Inject(DarDeBajaMiembroUseCase) private readonly baja: DarDeBajaMiembroUseCase,
    @Inject(CambiarApodoDeMiembroUseCase) private readonly apodo: CambiarApodoDeMiembroUseCase,
    @Inject(ListarMiembrosUseCase) private readonly listado: ListarMiembrosUseCase,
    @Inject(ListarMiembrosAsignablesUseCase)
    private readonly asignables: ListarMiembrosAsignablesUseCase,
  ) {}

  @Get()
  @RequierePermiso('usuarios.administrar')
  async listar(): Promise<ListaDeMiembros> {
    return this.listado.ejecutar();
  }

  /** Va antes de cualquier `@Get(':id')` que se añada algún día (ADR-0022). */
  @Get('asignables')
  @RequierePermiso('bandeja.operar')
  async listarAsignables(): Promise<ListaDeMiembrosAsignables> {
    return this.asignables.ejecutar();
  }

  /**
   * ADR-0031: fija el apodo de ingreso de un miembro existente, o lo quita con `null`. 404 si no es
   * de esta agencia, 403 si tiene más permisos que quien lo pide, 409 `APODO_NO_DISPONIBLE` si ya
   * es de otra persona. El apodo no se devuelve ni se imprime.
   */
  @Patch(':id/apodo')
  @HttpCode(200)
  @RequierePermiso('usuarios.administrar')
  async cambiarApodo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CambiarApodo)) cuerpo: CambiarApodo,
  ): Promise<RespuestaOk> {
    await this.apodo.ejecutar(id, cuerpo.apodo);
    return { ok: true };
  }

  @Post(':id/baja')
  @HttpCode(200)
  @RequierePermiso('usuarios.administrar')
  async darDeBaja(@Param('id', ParseUUIDPipe) id: string): Promise<RespuestaOk> {
    await this.baja.ejecutar(id);
    return { ok: true };
  }
}
