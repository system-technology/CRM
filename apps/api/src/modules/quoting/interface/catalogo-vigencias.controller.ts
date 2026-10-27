/**
 * Vigencias y tarifas gestionables por id (ADR-0017 §4.1, T-043).
 *
 * Todas las rutas exigen `catalogo.administrar` y pasan por `AplicadorPorId`, que delega en el mismo
 * validador y el mismo aplicador que los demás canales. Quien envía un `neto` sin
 * `cotizacion.ver_neto_y_margen` recibe 403 antes de tocar nada; sin ese permiso, además, el
 * listado omite el neto (la clave no viaja).
 *
 * El tenant y el usuario salen de la sesión; un `tenantId` en el cuerpo es un 400 donde el esquema
 * es `.strict()` y se descarta en los demás.
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
  CrearTarifa,
  CrearVigencia,
  EditarTarifa,
  EditarVigencia,
  type Permiso,
} from '@viajapro/contracts';
import { permisoDenegado } from '../../../shared/autorizacion/permiso.guard.js';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { type ContextoDeAplicacion } from '../application/aplicador-de-catalogo.js';
import { AplicadorPorId } from '../application/aplicador-por-id.js';

const PERMISO_NETO: Permiso = 'cotizacion.ver_neto_y_margen';

function contextoDeAplicacion(): ContextoDeAplicacion {
  const { tenantId, usuarioId, permisos } = ContextoTenant.obtener();
  return { tenantId, usuarioId, permisos: [...permisos] };
}

/** Enviar un neto es tocar el dato del mayorista: sin el permiso, 403 y no se guarda nada. */
function exigirPermisoDeNeto(traeNeto: boolean): void {
  if (traeNeto && !ContextoTenant.tienePermiso(PERMISO_NETO)) throw permisoDenegado(PERMISO_NETO);
}

@Controller('api/v1/catalogo')
export class CatalogoVigenciasController {
  // `@Inject` explícito: ver la nota de `catalogo.controller.ts`.
  constructor(@Inject(AplicadorPorId) private readonly aplicador: AplicadorPorId) {}

  @Get('paquetes/:id/vigencias')
  @RequierePermiso('catalogo.administrar')
  async listar(@Param('id', new ParseUUIDPipe()) id: string) {
    return { datos: await this.aplicador.listarVigencias(id, contextoDeAplicacion()) };
  }

  @Post('vigencias')
  @RequierePermiso('catalogo.administrar')
  async crearVigencia(@Body(new ZodValidationPipe(CrearVigencia)) body: CrearVigencia) {
    exigirPermisoDeNeto(body.tarifas.some((t) => t.neto !== null));
    return this.aplicador.crearVigencia(body, contextoDeAplicacion());
  }

  @Patch('vigencias/:id')
  @RequierePermiso('catalogo.administrar')
  async editarVigencia(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(EditarVigencia)) body: EditarVigencia,
  ) {
    return this.aplicador.editarVigencia(id, body, contextoDeAplicacion());
  }

  @Post('vigencias/:id/tarifas')
  @RequierePermiso('catalogo.administrar')
  async crearTarifa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CrearTarifa)) body: CrearTarifa,
  ) {
    exigirPermisoDeNeto(body.neto !== null);
    return this.aplicador.crearTarifa(id, body, contextoDeAplicacion());
  }

  @Patch('tarifas/:id')
  @RequierePermiso('catalogo.administrar')
  async editarTarifa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(EditarTarifa)) body: EditarTarifa,
  ) {
    exigirPermisoDeNeto(body.neto !== undefined);
    return this.aplicador.editarTarifa(id, body, contextoDeAplicacion());
  }

  @Delete('tarifas/:id')
  @HttpCode(200)
  @RequierePermiso('catalogo.administrar')
  async eliminarTarifa(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.aplicador.eliminarTarifa(id, contextoDeAplicacion());
    return { id, eliminada: true };
  }
}
