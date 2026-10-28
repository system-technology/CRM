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
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CrearContacto as CrearContactoContrato,
  CrearOportunidad as CrearOportunidadContrato,
  CrearOportunidadDeConversacion as CrearOportunidadDeConversacionContrato,
  CrearSeguimiento as CrearSeguimientoContrato,
  EditarContacto as EditarContactoContrato,
  FiltroSeguimientos as FiltroSeguimientosContrato,
  MoverOportunidad as MovimientoContrato,
  type Contacto,
  type CrearContacto,
  type CrearOportunidad,
  type CrearOportunidadDeConversacion,
  type CrearSeguimiento,
  type EditarContacto,
  type FiltroSeguimientos,
  type MoverOportunidad as Movimiento,
  type FichaDeContacto,
  type Oportunidad,
  type PaginaContactos,
  type PaginaSeguimientos,
  type PendientesDelDia,
  type Seguimiento,
  type TableroPipeline,
} from '@viajapro/contracts';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { CrearOportunidadUseCase } from '../application/crear-oportunidad.js';
import { GestionarContactos } from '../application/gestionar-contactos.js';
import { GestionarSeguimientos } from '../application/gestionar-seguimientos.js';
import { MoverOportunidadUseCase } from '../application/mover-oportunidad.js';
import { PuertoCrm } from '../application/puerto-crm.js';
import { VerTablero } from '../application/ver-tablero.js';

/** Tope de la lista de contactos. Alto para una agencia, acotado para la base. */
const LIMITE_CONTACTOS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/v1/crm')
export class CrmController {
  constructor(
    @Inject(VerTablero) private readonly verTablero: VerTablero,
    @Inject(MoverOportunidadUseCase) private readonly mover: MoverOportunidadUseCase,
    @Inject(PuertoCrm) private readonly crm: PuertoCrm,
    @Inject(GestionarContactos) private readonly contactosUC: GestionarContactos,
    @Inject(CrearOportunidadUseCase) private readonly crearOportunidad: CrearOportunidadUseCase,
    @Inject(GestionarSeguimientos) private readonly seguimientos: GestionarSeguimientos,
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

  // ---------------------------------------------------------------------------
  // T-075: contactos y oportunidades
  // ---------------------------------------------------------------------------

  /** Alta de contacto. El teléfono se normaliza a E.164; duplicado en la agencia: 409. */
  @Post('contactos')
  async crearContacto(
    @Body(new ZodValidationPipe(CrearContactoContrato)) cuerpo: CrearContacto,
  ): Promise<Contacto> {
    return this.contactosUC.crear(cuerpo, ContextoTenant.obtener().usuarioId);
  }

  /** Edición parcial: solo se toca lo que viene. */
  @Patch('contactos/:id')
  async editarContacto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EditarContactoContrato)) cuerpo: EditarContacto,
  ): Promise<Contacto> {
    return this.contactosUC.editar(id, cuerpo, ContextoTenant.obtener().usuarioId);
  }

  /** Crear oportunidad sobre un contacto. Nace en la etapa inicial del embudo de la agencia. */
  @Post('oportunidades')
  async crearOportunidadDeContacto(
    @Body(new ZodValidationPipe(CrearOportunidadContrato)) cuerpo: CrearOportunidad,
  ): Promise<Oportunidad> {
    return this.crearOportunidad.paraContacto(cuerpo, ContextoTenant.obtener().usuarioId);
  }

  /** Crear oportunidad desde una conversación: el contacto sale de ella. */
  @Post('conversaciones/:conversacionId/oportunidades')
  async crearOportunidadDeConversacion(
    @Param('conversacionId', ParseUUIDPipe) conversacionId: string,
    @Body(new ZodValidationPipe(CrearOportunidadDeConversacionContrato))
    cuerpo: CrearOportunidadDeConversacion,
  ): Promise<Oportunidad> {
    return this.crearOportunidad.paraConversacion(
      conversacionId,
      cuerpo,
      ContextoTenant.obtener().usuarioId,
    );
  }

  // ---------------------------------------------------------------------------
  // T-077: seguimientos
  // ---------------------------------------------------------------------------

  /** Lo pendiente de HOY (zona de la agencia) y lo vencido, del asesor en sesión por defecto. */
  @Get('seguimientos/pendientes-del-dia')
  async pendientesDelDia(@Query('asesorId') asesorId?: string): Promise<PendientesDelDia> {
    const actor = ContextoTenant.obtener().usuarioId;
    const quien = asesorId === undefined || asesorId === 'yo' ? actor : asesorId;
    if (quien !== null && !UUID.test(quien)) {
      throw new BadRequestException({
        error: { code: 'ENTRADA_INVALIDA', message: 'asesorId debe ser un UUID o «yo».' },
      });
    }
    return this.seguimientos.pendientesDelDia(quien, new Date());
  }

  @Get('seguimientos')
  async listarSeguimientos(
    @Query(new ZodValidationPipe(FiltroSeguimientosContrato)) filtro: FiltroSeguimientos,
  ): Promise<PaginaSeguimientos> {
    const datos = await this.seguimientos.listar(filtro, ContextoTenant.obtener().usuarioId);
    return { datos, pageInfo: { nextCursor: null, hasMore: false } };
  }

  @Post('seguimientos')
  async crearSeguimiento(
    @Body(new ZodValidationPipe(CrearSeguimientoContrato)) cuerpo: CrearSeguimiento,
  ): Promise<Seguimiento> {
    return this.seguimientos.crear(cuerpo, ContextoTenant.obtener().usuarioId);
  }

  @Post('seguimientos/:id/completar')
  async completarSeguimiento(@Param('id', ParseUUIDPipe) id: string): Promise<Seguimiento> {
    return this.seguimientos.completar(id, new Date());
  }
}
