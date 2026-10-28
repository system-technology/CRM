/**
 * API del catálogo y la cotización de paquetes.
 *
 * La validación de entrada usa los esquemas Zod de `@viajapro/contracts`: la misma definición
 * que tipa el formulario en la web. Un contrato, una validación.
 */

import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ParametrosPagina } from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { autorizarMargen } from '../../../shared/autorizacion/margen.js';
import { ListarPaquetesUseCase } from '../application/listar-paquetes.use-case.js';

@Controller('api/v1')
export class CatalogoController {
  // `@Inject` explícito, y no solo el tipo del parámetro. Sin él, Nest construye este
  // controlador **con cero dependencias y sin quejarse**: los metadatos de decorador no
  // sobreviven al transpilador que usamos en desarrollo, y el fallo no aparece hasta la primera
  // petición real, como un `undefined` en mitad del manejador. Pasó el 2026-10-13 en los casos
  // de uso de `quoting` y costó una tarde. Un token explícito no depende de los metadatos.
  //
  // `guardia-de-inyeccion.spec.ts` pone esto en rojo si alguien lo vuelve a omitir.
  constructor(
    @Inject(ListarPaquetesUseCase) private readonly listarPaquetes: ListarPaquetesUseCase,
  ) {}

  /** Catálogo de la agencia. Paginado por cursor desde el primer día. */
  @Get('paquetes')
  async listar(@Query(new ZodValidationPipe(ParametrosPagina)) params: ParametrosPagina) {
    return this.listarPaquetes.ejecutar(params);
  }

  @Get('paquetes/:id')
  async detalle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('incluirMargen') incluirMargen?: string,
  ) {
    // Solo la cadena `true` activa el neto: cualquier otra cosa es el valor seguro.
    return this.listarPaquetes.detalle(id, autorizarMargen(incluirMargen === 'true'));
  }
}
