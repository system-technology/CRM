/**
 * El archivo de viaje (ADR-0024 §3.7).
 *
 * - `GET  /api/v1/archivos`                            lista con avance y semáforo
 * - `GET  /api/v1/archivos/:id`                        detalle con reservas y pasajeros
 * - `PUT  /api/v1/archivos/:id/reservas/:reservaId`    fija el estado y los datos del paso
 * - `PUT  /api/v1/archivos/:id/pasajeros`              reemplaza la lista completa
 * - `POST /api/v1/archivos/:id/cancelacion`            cancela el archivo con motivo
 *
 * El `tenantId` no aparece en ninguna firma: lo pone el middleware desde la sesión. La lectura
 * omite `netoUnidades` sin `cotizacion.ver_neto_y_margen` (T-248).
 *
 * **Permiso de las mutaciones.** ADR-0024 §3.7 pide `archivo.ver` y `archivo.operar`, que aún no
 * existen en el catálogo (exigen ampliar el `CHECK roles_permisos_del_catalogo`: migración de
 * `datos`). Mientras tanto se exige `cotizacion.escribir`, que tienen DUENO y ASESOR; es el único
 * sitio donde cambiarlo cuando exista `archivo.operar`. La lectura queda abierta a todo miembro.
 */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ActualizarReserva,
  CancelarArchivo,
  type DetalleDeArchivo,
  type ListaDeArchivos,
  ListarArchivos,
  type Permiso,
  ReemplazarPasajeros,
} from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { OperarArchivoUseCase } from '../application/operar-archivo.use-case.js';

/** Provisional: ver el comentario del archivo. */
export const PERMISO_PARA_OPERAR_ARCHIVOS: Permiso = 'cotizacion.escribir';

@Controller('api/v1/archivos')
export class ArchivosController {
  constructor(@Inject(OperarArchivoUseCase) private readonly archivos: OperarArchivoUseCase) {}

  @Get()
  async listar(
    @Query(new ZodValidationPipe(ListarArchivos)) params: ListarArchivos,
  ): Promise<ListaDeArchivos> {
    return this.archivos.listar(params);
  }

  @Get(':id')
  async leer(@Param('id', new ParseUUIDPipe()) id: string): Promise<DetalleDeArchivo> {
    return this.archivos.leer(id);
  }

  @RequierePermiso(PERMISO_PARA_OPERAR_ARCHIVOS)
  @Put(':id/reservas/:reservaId')
  async actualizarReserva(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('reservaId', new ParseUUIDPipe()) reservaId: string,
    @Body(new ZodValidationPipe(ActualizarReserva)) body: ActualizarReserva,
  ): Promise<DetalleDeArchivo> {
    return this.archivos.actualizarReserva(id, reservaId, body);
  }

  @RequierePermiso(PERMISO_PARA_OPERAR_ARCHIVOS)
  @Put(':id/pasajeros')
  async reemplazarPasajeros(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ReemplazarPasajeros)) body: ReemplazarPasajeros,
  ): Promise<DetalleDeArchivo> {
    return this.archivos.reemplazarPasajeros(id, body);
  }

  @RequierePermiso(PERMISO_PARA_OPERAR_ARCHIVOS)
  @Post(':id/cancelacion')
  async cancelar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelarArchivo)) body: CancelarArchivo,
  ): Promise<DetalleDeArchivo> {
    return this.archivos.cancelar(id, body);
  }
}
