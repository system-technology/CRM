/**
 * La bandeja del asesor por HTTP. Validación con los esquemas de `@viajapro/contracts` (R3); el
 * tenant y el usuario salen de la sesión (middleware), nunca de la ruta ni del cuerpo.
 *
 * **Ninguna ruta repite la regla de visibilidad:** cada una pasa por un caso de uso que la saca del
 * contexto y la entrega al puerto. Una conversación ajena responde `404 CONVERSACION_NO_ENCONTRADA`,
 * igual que un id que no existe. El id mal formado es un `400` y no revela nada.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  AsignarConversacionCuerpo,
  CambiarEstadoCuerpo,
  ConsultarBandeja,
  ConsultarMensajes,
  CrearNotaCuerpo,
  EnviarCotizacionCuerpo,
  EnviarTextoCuerpo,
  type AdjuntoDeConversacion,
  type ContadoresBandeja,
  type ConversacionDetalle,
  type ConversacionResumen,
  type ListaDeNotas,
  type Mensaje,
  type NotaDeConversacion,
  type PaginaBandeja,
  type PaginaMensajes,
  type RespuestaOk,
} from '@viajapro/contracts';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { ActuarEnConversacionUseCase } from '../application/actuar-en-conversacion.js';
import { ConsultarBandejaUseCase } from '../application/consultar-bandeja.js';

@Controller('api/v1/conversaciones')
export class ConversacionesController {
  constructor(
    @Inject(ConsultarBandejaUseCase) private readonly consultar: ConsultarBandejaUseCase,
    @Inject(ActuarEnConversacionUseCase) private readonly actuar: ActuarEnConversacionUseCase,
  ) {}

  @Get()
  listar(
    @Query(new ZodValidationPipe(ConsultarBandeja)) consulta: ConsultarBandeja,
  ): Promise<PaginaBandeja> {
    return this.consultar.listar(consulta);
  }

  // Antes de `:id`, o `contadores` se leería como un id.
  @Get('contadores')
  contadores(): Promise<ContadoresBandeja> {
    return this.consultar.contadores();
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string): Promise<ConversacionDetalle> {
    return this.consultar.detalle(id);
  }

  @Get(':id/mensajes')
  mensajes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ConsultarMensajes)) consulta: ConsultarMensajes,
  ): Promise<PaginaMensajes> {
    return this.consultar.mensajes(id, consulta);
  }

  @Get(':id/notas')
  notas(@Param('id', ParseUUIDPipe) id: string): Promise<ListaDeNotas> {
    return this.consultar.notas(id);
  }

  @Get(':id/adjuntos/:adjuntoId')
  adjunto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adjuntoId', ParseUUIDPipe) adjuntoId: string,
  ): Promise<AdjuntoDeConversacion> {
    return this.consultar.adjunto(id, adjuntoId);
  }

  /** Responder es tomar: si la conversación no tenía asesor, queda asignada a quien responde. */
  @Post(':id/mensajes')
  @HttpCode(201)
  responder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EnviarTextoCuerpo)) cuerpo: EnviarTextoCuerpo,
  ): Promise<Mensaje> {
    return this.actuar.responder(id, cuerpo);
  }

  /** Enviar cotización guardada por WhatsApp (T-073, T-074). */
  @Post(':id/cotizaciones')
  @HttpCode(201)
  enviarCotizacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EnviarCotizacionCuerpo)) cuerpo: EnviarCotizacionCuerpo,
  ): Promise<Mensaje> {
    return this.actuar.enviarCotizacion(id, cuerpo);
  }

  /** Una nota interna no asigna. */
  @Post(':id/notas')
  @HttpCode(201)
  nota(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CrearNotaCuerpo)) cuerpo: CrearNotaCuerpo,
  ): Promise<NotaDeConversacion> {
    return this.actuar.crearNota(id, cuerpo);
  }

  /** Marcar como leída no asigna. */
  @Post(':id/leida')
  @HttpCode(200)
  async leida(@Param('id', ParseUUIDPipe) id: string): Promise<RespuestaOk> {
    await this.actuar.marcarLeida(id);
    return { ok: true };
  }

  /** Cambiar el estado no asigna. */
  @Patch(':id/estado')
  estado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CambiarEstadoCuerpo)) cuerpo: CambiarEstadoCuerpo,
  ): Promise<ConversacionResumen> {
    return this.actuar.cambiarEstado(id, cuerpo);
  }

  /**
   * Tomar (`usuarioId` = uno mismo), reasignar (otro miembro activo de la agencia) o soltar
   * (`null`). `PUT` porque fija el valor completo de la asignación: repetirlo no cambia nada.
   */
  @Put(':id/asignacion')
  asignar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AsignarConversacionCuerpo)) cuerpo: AsignarConversacionCuerpo,
  ): Promise<ConversacionResumen> {
    return this.actuar.asignar(id, cuerpo);
  }
}
