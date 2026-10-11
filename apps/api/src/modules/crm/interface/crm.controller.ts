/**
 * Rutas del contexto `crm`.
 *
 * Validación con los esquemas de `@viajapro/contracts`, uno por ruta (R3). Sin `ValidationPipe`
 * global: duplicaría la definición de cada forma de datos en decoradores de `class-validator`,
 * que es justo lo que la regla evita.
 *
 * El `tenantId` **no aparece en ninguna firma**, y es deliberado: lo pone el middleware desde la
 * sesión. Un `tenantId` que viaje en la ruta o en el cuerpo es un parámetro que alguien puede
 * cambiar, y ese es el hallazgo crítico de cualquier auditoría multi-tenant.
 */

import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  MoverOportunidad as MovimientoContrato,
  type MoverOportunidad as Movimiento,
  type FichaDeContacto,
  type Oportunidad,
  type PaginaContactos,
  type TableroPipeline,
} from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { MoverOportunidadUseCase } from '../application/mover-oportunidad.js';
import { PuertoCrm } from '../application/puerto-crm.js';
import { VerTablero } from '../application/ver-tablero.js';

/** Tope de la lista de contactos. Alto para una agencia, acotado para la base. */
const LIMITE_CONTACTOS = 50;

@Controller('api/v1/crm')
export class CrmController {
  constructor(
    @Inject(VerTablero) private readonly verTablero: VerTablero,
    @Inject(MoverOportunidadUseCase) private readonly mover: MoverOportunidadUseCase,
    @Inject(PuertoCrm) private readonly crm: PuertoCrm,
  ) {}

  /** El tablero del pipeline, con sus columnas tal como esta agencia las tiene configuradas. */
  @Get('tablero')
  async tablero(): Promise<TableroPipeline> {
    return this.verTablero.ejecutar();
  }

  /**
   * Arrastrar una tarjeta a otra etapa.
   *
   * `PATCH` y no `PUT`: mover no reemplaza la oportunidad, cambia una cosa de ella. Las reglas
   * de pérdida se aplican en el caso de uso y salen como error de dominio tipado.
   */
  @Patch('oportunidades/:id/etapa')
  async moverDeEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(MovimientoContrato)) movimiento: Movimiento,
  ): Promise<Oportunidad> {
    return this.mover.ejecutar(id, movimiento);
  }

  /**
   * La ficha del panel lateral de la bandeja.
   *
   * Una sola petición a propósito: el asesor abre una conversación y necesita de inmediato
   * quién es, qué se le cotizó y qué hay que hacer después. Tres llamadas encadenadas aquí se
   * notan en una pantalla que se abre cien veces al día.
   */
  @Get('contactos/:id/ficha')
  async ficha(@Param('id', ParseUUIDPipe) id: string): Promise<FichaDeContacto> {
    const ficha = await this.crm.fichaDeContacto(id);
    if (!ficha) {
      // 404 y no una ficha vacía: una ficha vacía se pinta igual que la de un contacto sin
      // datos, y el asesor no sabría si es que no existe o es que no tiene nada.
      throw new NotFoundException({
        error: { code: 'CONTACTO_NO_ENCONTRADO', message: 'No existe ese contacto.' },
      });
    }
    return ficha;
  }

  @Get('contactos')
  async contactos(@Query('buscar') buscar?: string): Promise<PaginaContactos> {
    const termino = buscar?.trim() ? buscar.trim() : null;
    const datos = await this.crm.listarContactos({ buscar: termino, limite: LIMITE_CONTACTOS });
    return {
      datos,
      // Sin cursor todavía: con 50 por página una agencia no lo nota, y prometer paginación
      // que no está implementada es peor que no ofrecerla.
      pageInfo: { nextCursor: null, hasMore: datos.length === LIMITE_CONTACTOS },
    };
  }
}
