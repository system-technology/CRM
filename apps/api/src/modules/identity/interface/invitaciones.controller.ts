/**
 * Invitaciones (ADR-0011, rebanada 4).
 *
 *   POST /api/v1/identidad/invitaciones     el dueño invita (ruta de negocio: pide sesión y agencia)
 *   POST /api/v1/auth/invitaciones/aceptar  la persona invitada acepta (SIN sesión, token en el cuerpo)
 *
 * Ambas responden `{ ok: true }` y nada más: **no dicen si el correo ya existía**, ni en esta
 * agencia ni en otra. Contratos en `packages/contracts/src/identidad.ts`.
 */
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { AceptarInvitacion, InvitarMiembro, type RespuestaOk } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { AceptarInvitacionUseCase } from '../application/aceptar-invitacion.use-case.js';
import { InvitarMiembroUseCase } from '../application/invitar-miembro.use-case.js';

@Controller('api/v1/identidad/invitaciones')
export class InvitacionesController {
  constructor(@Inject(InvitarMiembroUseCase) private readonly invitar: InvitarMiembroUseCase) {}

  /** `202`: el correo se encola, no se envía en esta petición. */
  @Post()
  @HttpCode(202)
  @RequierePermiso('usuarios.administrar')
  async invitarMiembro(
    @Body(new ZodValidationPipe(InvitarMiembro)) body: InvitarMiembro,
  ): Promise<RespuestaOk> {
    await this.invitar.ejecutar(body, process.env['WEB_PUBLIC_URL'] ?? 'http://localhost:3000');
    return { ok: true };
  }
}

@Controller('api/v1/auth/invitaciones')
export class AceptarInvitacionController {
  constructor(
    @Inject(AceptarInvitacionUseCase) private readonly aceptar: AceptarInvitacionUseCase,
  ) {}

  @Post('aceptar')
  @HttpCode(200)
  async aceptarInvitacion(
    @Body(new ZodValidationPipe(AceptarInvitacion)) body: AceptarInvitacion,
  ): Promise<RespuestaOk> {
    await this.aceptar.ejecutar(body);
    return { ok: true };
  }
}
