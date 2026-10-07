/**
 * API del catálogo y la cotización de paquetes.
 *
 * La validación de entrada usa los esquemas Zod de `@viajapro/contracts`: la misma definición
 * que tipa el formulario en la web. Un contrato, una validación.
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CotizarPaquete,
  type CotizacionCalculada,
  ParametrosPagina,
} from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { CotizarPaqueteUseCase } from '../application/cotizar-paquete.use-case.js';
import { ListarPaquetesUseCase } from '../application/listar-paquetes.use-case.js';

@Controller('api/v1')
export class CatalogoController {
  constructor(
    private readonly listarPaquetes: ListarPaquetesUseCase,
    private readonly cotizarPaquete: CotizarPaqueteUseCase,
  ) {}

  /** Catálogo de la agencia. Paginado por cursor desde el primer día. */
  @Get('paquetes')
  async listar(@Query(new ZodValidationPipe(ParametrosPagina)) params: ParametrosPagina) {
    return this.listarPaquetes.ejecutar(params);
  }

  @Get('paquetes/:id')
  async detalle(@Param('id') id: string) {
    return this.listarPaquetes.detalle(id);
  }

  /**
   * Calcula el precio de un paquete para unas fechas y una composición de pasajeros.
   *
   * No persiste nada: es el cálculo que el asesor ve mientras ajusta. La cotización que se
   * guarda y se envía al cliente es otra operación, y esa sí es inmutable por versión.
   */
  @Post('paquetes/cotizar')
  async cotizar(
    @Body(new ZodValidationPipe(CotizarPaquete)) body: CotizarPaquete,
  ): Promise<CotizacionCalculada> {
    return this.cotizarPaquete.ejecutar(body);
  }
}
