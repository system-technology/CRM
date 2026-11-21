/**
 * Cobros del viajero (ADR-0034 §8). Dos controladores porque cuelgan de dos raíces:
 *
 *   `PagosDeArchivoController`  (`/api/v1/archivos/:id/…`)
 *   - `POST /api/v1/archivos/:id/pagos`                  registra un movimiento (201; 200 si es un reintento)
 *   - `POST /api/v1/archivos/:id/pagos/:pagoId/reverso`  anula un movimiento, con motivo
 *   - `POST /api/v1/archivos/:id/plazo-de-cobro`         fija la fecha límite del archivo
 *   - `GET  /api/v1/archivos/:id/cobro`                  total, pagado, saldo, situación, estado e historial
 *
 *   `CobrosController`          (`/api/v1/cobros`)
 *   - `PUT  /api/v1/cobros/parametros`                   días del plazo por defecto de la agencia
 *   - `GET  /api/v1/cobros`                              la vista «quién pagó y quién debe»
 *
 * El `tenantId` y el autor no aparecen en ninguna firma ni en ningún cuerpo: salen de la sesión.
 *
 * **Permisos.** Toda ruta exige `cobro.ver` (la respuesta lleva el saldo y el historial: con
 * `cobro.registrar` solo no se lee). `POST …/pagos` NO puede declarar un permiso fijo porque
 * depende del `tipo` del cuerpo: PAGO exige `cobro.registrar` y los otros tres `cobro.corregir`; lo
 * comprueba `RegistrarMovimientoUseCase` antes de tocar la base y lo prueban las e2e. Reverso,
 * plazo y parámetros exigen `cobro.corregir` en la ruta.
 */
import { Body, Controller, Get, Inject, Param, Post, Put, Query, Res } from '@nestjs/common';
import {
  type CobroDelArchivo,
  FijarParametrosDeCobro,
  FijarPlazoDeCobro,
  IdEnMinusculas,
  ListarCobros,
  type ParametrosDeCobro,
  RegistrarMovimiento,
  type ResultadoDeMovimiento,
  ReversarMovimiento,
  type VistaDeCobros,
} from '@viajapro/contracts';
import type { Response } from 'express';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { LeerCobroUseCase } from '../application/leer-cobro.use-case.js';
import { PlazosYParametrosUseCase } from '../application/plazos-y-parametros.use-case.js';
import { RegistrarMovimientoUseCase } from '../application/registrar-movimiento.use-case.js';

@RequierePermiso('cobro.ver')
@Controller('api/v1/archivos')
export class PagosDeArchivoController {
  constructor(
    @Inject(RegistrarMovimientoUseCase) private readonly registro: RegistrarMovimientoUseCase,
    @Inject(PlazosYParametrosUseCase) private readonly plazos: PlazosYParametrosUseCase,
    @Inject(LeerCobroUseCase) private readonly lector: LeerCobroUseCase,
  ) {}

  @RequierePermiso('cobro.ver')
  @Post(':id/pagos')
  async registrarMovimiento(
    @Param('id', new ZodValidationPipe(IdEnMinusculas)) id: string,
    @Body(new ZodValidationPipe(RegistrarMovimiento)) body: RegistrarMovimiento,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResultadoDeMovimiento> {
    const { creado, resultado } = await this.registro.registrar(id, body);
    // Un reintento idempotente con el mismo contenido responde 200 con la fila existente.
    res.status(creado ? 201 : 200);
    return resultado;
  }

  @RequierePermiso('cobro.corregir')
  @Post(':id/pagos/:pagoId/reverso')
  async reversar(
    @Param('id', new ZodValidationPipe(IdEnMinusculas)) id: string,
    @Param('pagoId', new ZodValidationPipe(IdEnMinusculas)) pagoId: string,
    @Body(new ZodValidationPipe(ReversarMovimiento)) body: ReversarMovimiento,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ResultadoDeMovimiento> {
    const { creado, resultado } = await this.registro.reversar(id, pagoId, body);
    res.status(creado ? 201 : 200);
    return resultado;
  }

  @RequierePermiso('cobro.corregir')
  @Post(':id/plazo-de-cobro')
  async fijarPlazo(
    @Param('id', new ZodValidationPipe(IdEnMinusculas)) id: string,
    @Body(new ZodValidationPipe(FijarPlazoDeCobro)) body: FijarPlazoDeCobro,
  ): Promise<CobroDelArchivo> {
    return this.plazos.fijarPlazo(id, body);
  }

  @RequierePermiso('cobro.ver')
  @Get(':id/cobro')
  async leerCobro(
    @Param('id', new ZodValidationPipe(IdEnMinusculas)) id: string,
  ): Promise<CobroDelArchivo> {
    return this.lector.delArchivo(id);
  }
}

@RequierePermiso('cobro.ver')
@Controller('api/v1/cobros')
export class CobrosController {
  constructor(
    @Inject(PlazosYParametrosUseCase) private readonly parametros: PlazosYParametrosUseCase,
    @Inject(LeerCobroUseCase) private readonly lector: LeerCobroUseCase,
  ) {}

  @RequierePermiso('cobro.ver')
  @Get()
  async vista(
    @Query(new ZodValidationPipe(ListarCobros)) params: ListarCobros,
  ): Promise<VistaDeCobros> {
    return this.lector.vista(params);
  }

  @RequierePermiso('cobro.corregir')
  @Put('parametros')
  async fijarParametros(
    @Body(new ZodValidationPipe(FijarParametrosDeCobro)) body: FijarParametrosDeCobro,
  ): Promise<ParametrosDeCobro> {
    return this.parametros.fijarParametros(body);
  }
}
