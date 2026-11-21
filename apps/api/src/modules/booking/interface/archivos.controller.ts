/**
 * El archivo de viaje (ADR-0024 §3.7).
 *
 * - `GET  /api/v1/archivos`                            lista con avance y semáforo
 * - `GET  /api/v1/archivos/sin-responsable`            los abiertos por los que no responde nadie
 * - `GET  /api/v1/archivos/:id`                        detalle con reservas y pasajeros
 * - `PUT  /api/v1/archivos/:id/reservas/:reservaId`    fija el estado y los datos del paso
 * - `PUT  /api/v1/archivos/:id/pasajeros`              reemplaza la lista completa
 * - `POST /api/v1/archivos/:id/cancelacion`            cancela el archivo con motivo
 *
 * El `tenantId` no aparece en ninguna firma: lo pone el middleware desde la sesión. La lectura
 * omite `netoUnidades` sin `cotizacion.ver_neto_y_margen` (T-248).
 *
 * **Permisos** (ADR-0024 §3.7, T-249, migración `20261118100000`): las dos lecturas exigen
 * `archivo.ver` —el detalle trae nombres y edades de pasajeros, menores incluidos— y las tres
 * mutaciones `archivo.operar`. Los tres roles sembrados (DUENO, ASESOR, OPERACIONES) tienen los
 * dos; un rol que la agencia componga sin ellos recibe 403.
 *
 * **`sin-responsable` (T-529) exige los dos**: es una lista de archivos huérfanos para que alguien
 * los tome, y quien no puede operarlos no tiene nada que hacer con ella.
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
  type ListaDeArchivosSinResponsable,
  ListarArchivos,
  ListarArchivosSinResponsable,
  type Permiso,
  ReemplazarPasajeros,
} from '@viajapro/contracts';
import { RequierePermiso } from '../../../shared/autorizacion/permiso.decorator.js';
import { ZodValidationPipe } from '../../../shared/validacion/zod-validation.pipe.js';
import { ListarArchivosSinResponsableUseCase } from '../application/listar-sin-responsable.use-case.js';
import { OperarArchivoUseCase } from '../application/operar-archivo.use-case.js';

export const PERMISO_PARA_VER_ARCHIVOS: Permiso = 'archivo.ver';
export const PERMISO_PARA_OPERAR_ARCHIVOS: Permiso = 'archivo.operar';

// Toda ruta exige archivo.ver (también las mutaciones, que devuelven el detalle con pasajeros y
// menores: con archivo.operar solo no se lee). El guard combina el de la clase y el del método.
@RequierePermiso(PERMISO_PARA_VER_ARCHIVOS)
@Controller('api/v1/archivos')
export class ArchivosController {
  constructor(
    @Inject(OperarArchivoUseCase) private readonly archivos: OperarArchivoUseCase,
    @Inject(ListarArchivosSinResponsableUseCase)
    private readonly sinResponsable: ListarArchivosSinResponsableUseCase,
  ) {}

  @RequierePermiso(PERMISO_PARA_VER_ARCHIVOS)
  @Get()
  async listar(
    @Query(new ZodValidationPipe(ListarArchivos)) params: ListarArchivos,
  ): Promise<ListaDeArchivos> {
    return this.archivos.listar(params);
  }

  /**
   * **Va ANTES de `:id`**: Nest casa las rutas en orden de declaración y, al revés, esta ruta
   * entraría por `:id` y el `ParseUUIDPipe` respondería 400.
   */
  @RequierePermiso(PERMISO_PARA_OPERAR_ARCHIVOS)
  @Get('sin-responsable')
  async listarSinResponsable(
    @Query(new ZodValidationPipe(ListarArchivosSinResponsable))
    params: ListarArchivosSinResponsable,
  ): Promise<ListaDeArchivosSinResponsable> {
    return this.sinResponsable.ejecutar(params);
  }

  @RequierePermiso(PERMISO_PARA_VER_ARCHIVOS)
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
