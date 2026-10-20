/**
 * Rutas de salidas y tarifas — el catálogo de ADR-0009.
 *
 * El `tenantId` **no aparece en ninguna firma**: lo pone el middleware desde la sesión. Un
 * `tenantId` que viaje en la ruta o en el cuerpo es un parámetro que alguien puede cambiar.
 *
 * Validación con los esquemas de `@viajapro/contracts`, uno por ruta (R3).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import {
  CotizarSalida as CotizarSalidaContrato,
  type CotizacionDeSalida,
  type CotizarSalida as PeticionCotizar,
  type SalidaPublicada,
} from '@viajapro/contracts';
import { autorizarMargen } from '../../../shared/autorizacion/margen.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { CotizarSalidaUseCase } from '../application/cotizar-salida.use-case.js';
import { ListarSalidasUseCase } from '../application/listar-salidas.use-case.js';

/** Tope del listado. Una campaña de la agencia piloto cabe de sobra. */
const LIMITE_SALIDAS = 200;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

@Controller('api/v1/catalogo')
export class SalidasController {
  constructor(
    @Inject(ListarSalidasUseCase) private readonly listar: ListarSalidasUseCase,
    @Inject(CotizarSalidaUseCase) private readonly cotizar: CotizarSalidaUseCase,
  ) {}

  /**
   * Las salidas publicadas a partir de una fecha.
   *
   * `desde` es obligatorio a propósito: sin él saldría el histórico entero de la agencia, que no
   * es lo que nadie quiere ver y es la consulta más cara que se puede pedir aquí.
   */
  @Get('salidas')
  async salidas(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('paqueteId') paqueteId?: string,
    @Query('limite') limite?: string,
  ): Promise<{ salidas: SalidaPublicada[] }> {
    if (!desde || !FORMATO_FECHA.test(desde)) {
      throw new BadRequestException('`desde` es obligatorio y va en formato AAAA-MM-DD');
    }
    if (hasta && !FORMATO_FECHA.test(hasta)) {
      throw new BadRequestException('`hasta` va en formato AAAA-MM-DD');
    }

    const pedido = Number(limite ?? LIMITE_SALIDAS);
    const tope =
      Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_SALIDAS) : LIMITE_SALIDAS;

    return {
      salidas: await this.listar.ejecutar({
        desde,
        hasta: hasta ?? null,
        paqueteId: paqueteId ?? null,
        limite: tope,
      }),
    };
  }

  /**
   * Cotizar un paquete contra una fecha.
   *
   * `POST` y no `GET` porque la composición de pasajeros va en el cuerpo y porque esto **va a
   * persistir** una cotización en cuanto exista la tabla. Cambiar el verbo después obliga a tocar
   * la API y el cliente a la vez.
   *
   * **No atrapa los errores de dominio**, y es a propósito: el filtro global ya los traduce con
   * su código estable —`SIN_VIGENCIA`, `VIGENCIAS_EMPATADAS`— y con el estado que les toca.
   * Envolverlos aquí los convertía en un `HTTP_ERROR` genérico y le quitaba a la pantalla lo
   * único con lo que puede decidir qué enseñar.
   *
   * `200` y no `201`: cotizar calcula, no crea nada. Lo hará el día que la cotización se guarde,
   * y entonces el cambio de código será una señal honesta de que algo nuevo pasa.
   */
  @Post('cotizar')
  @HttpCode(200)
  async cotizarSalida(
    @Body(new ZodValidationPipe(CotizarSalidaContrato)) peticion: PeticionCotizar,
  ): Promise<CotizacionDeSalida> {
    // `incluirMargen: true` exige el permiso: sin él, 403 (ADR-0011, paso 6).
    autorizarMargen(peticion.incluirMargen ?? false);
    return this.cotizar.ejecutar(peticion);
  }
}
