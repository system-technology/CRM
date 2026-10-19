/**
 * Cotizaciones guardadas.
 *
 * - `POST /api/v1/cotizaciones`                 crea la cabecera y la versión 1 (201)
 * - `POST /api/v1/cotizaciones/:id/versiones`   añade la versión siguiente (201)
 * - `GET  /api/v1/cotizaciones/:id`             la cabecera con todas sus versiones
 *
 * El `tenantId` no aparece en ninguna firma: lo pone el middleware desde la sesión. El margen
 * (y con él el neto) solo sale con `?incluirMargen=true`, igual que en la cotización sin guardar.
 */
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  AnadirVersionACotizacion,
  CambiarEstadoDeCotizacion,
  type CotizacionGuardada,
  GuardarCotizacion,
  ListarCotizaciones,
  type PaginaDeCotizaciones,
} from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { CotizacionesUseCase } from '../application/cotizaciones.use-case.js';

/** Solo la cadena `true` activa el margen: cualquier otra cosa es el valor seguro. */
const pideMargen = (v: string | undefined): boolean => v === 'true';

@Controller('api/v1/cotizaciones')
export class CotizacionesController {
  constructor(@Inject(CotizacionesUseCase) private readonly cotizaciones: CotizacionesUseCase) {}

  @Post()
  async guardar(
    @Body(new ZodValidationPipe(GuardarCotizacion)) body: GuardarCotizacion,
    @Query('incluirMargen') incluirMargen?: string,
  ): Promise<CotizacionGuardada> {
    return this.cotizaciones.guardar(body, pideMargen(incluirMargen));
  }

  @Post(':id/versiones')
  async anadirVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AnadirVersionACotizacion)) body: AnadirVersionACotizacion,
    @Query('incluirMargen') incluirMargen?: string,
  ): Promise<CotizacionGuardada> {
    return this.cotizaciones.anadirVersion(id, body, pideMargen(incluirMargen));
  }

  /** Listado paginado por cursor. Sin `incluirMargen`: nunca neto ni margen (ADR-0011). */
  @Get()
  async listar(
    @Query(new ZodValidationPipe(ListarCotizaciones)) params: ListarCotizaciones,
  ): Promise<PaginaDeCotizaciones> {
    return this.cotizaciones.listar(params);
  }

  @Post(':id/estado')
  async cambiarEstado(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CambiarEstadoDeCotizacion)) body: CambiarEstadoDeCotizacion,
  ): Promise<CotizacionGuardada> {
    return this.cotizaciones.cambiarEstado(id, body.estado);
  }

  @Get(':id')
  async leer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('incluirMargen') incluirMargen?: string,
  ): Promise<CotizacionGuardada> {
    return this.cotizaciones.leer(id, pideMargen(incluirMargen));
  }
}
