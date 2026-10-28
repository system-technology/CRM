/**
 * Gestión del catálogo desde la pantalla (ADR-0017 §4.1): alta, edición y baja lógica de paquetes.
 *
 * Las tres rutas exigen `catalogo.administrar` y pasan por el mismo validador y el mismo
 * aplicador que los demás canales. **No existe ruta DELETE de paquete**: las cotizaciones guardadas
 * lo referencian (`Restrict`) y una baja es una operación explícita, nunca un borrado.
 *
 * El tenant y el usuario salen de la sesión (`ContextoTenant`); el cuerpo no puede traerlos:
 * los esquemas son `.strict()` y un `tenantId` ahí es un 400.
 */

import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CrearPaquete, EditarPaquete } from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import {
  AplicadorDeCatalogo,
  type ContextoDeAplicacion,
  type ResultadoDeAplicacion,
} from '../application/aplicador-de-catalogo.js';

function contextoDeAplicacion(): ContextoDeAplicacion {
  const { tenantId, usuarioId, permisos } = ContextoTenant.obtener();
  return { tenantId, usuarioId, permisos: [...permisos] };
}

function respuesta(resultado: ResultadoDeAplicacion) {
  return { id: resultado.paquetes[0]?.id ?? null, informe: resultado.informe };
}

@Controller('api/v1/catalogo/paquetes')
export class CatalogoGestionController {
  // `@Inject` explícito: ver la nota de `catalogo.controller.ts`.
  constructor(@Inject(AplicadorDeCatalogo) private readonly aplicador: AplicadorDeCatalogo) {}

  @Post()
  @RequierePermiso('catalogo.administrar')
  async crear(@Body(new ZodValidationPipe(CrearPaquete)) body: CrearPaquete) {
    return respuesta(await this.aplicador.crearPaquete(body, contextoDeAplicacion()));
  }

  @Patch(':id')
  @RequierePermiso('catalogo.administrar')
  async editar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(EditarPaquete)) body: EditarPaquete,
  ) {
    return respuesta(await this.aplicador.editarPaquete(id, body, contextoDeAplicacion()));
  }

  @Post(':id/desactivar')
  @HttpCode(200)
  @RequierePermiso('catalogo.administrar')
  async desactivar(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.aplicador.desactivarPaquete(id, contextoDeAplicacion());
    return { id, activo: false };
  }
}
