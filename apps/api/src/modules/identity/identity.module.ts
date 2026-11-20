import { Global, Module } from '@nestjs/common';
import { ResolutorDeAcceso } from '../../shared/puertos/puerto-de-acceso.js';
import { PuertoUsuariosConPermiso } from '../../shared/puertos/puertos-para-avisos.js';
import { UsuariosConPermisoPrisma } from './infrastructure/usuarios-con-permiso.prisma.js';
import { CambiarAgenciaActiva } from './application/cambiar-agencia-activa.use-case.js';
import { ResolverAcceso } from './application/resolver-acceso.use-case.js';
import { ObtenerSesionActual } from './application/sesion-actual.use-case.js';
import {
  PuertoAgencias,
  PuertoMembresias,
  PuertoSesiones,
  PuertoZonaHoraria,
} from './domain/puertos.js';
import {
  PuertoIdentidades,
  PuertoInvitaciones,
  PuertoMiembros,
} from './domain/puertos-de-miembros.js';
import { AceptarInvitacionUseCase } from './application/aceptar-invitacion.use-case.js';
import { DarDeBajaMiembroUseCase } from './application/dar-de-baja-miembro.use-case.js';
import { ListarMiembrosAsignablesUseCase } from './application/listar-miembros-asignables.use-case.js';
import { ListarMiembrosUseCase } from './application/listar-miembros.use-case.js';
import { InvitarMiembroUseCase } from './application/invitar-miembro.use-case.js';
import { IdentidadesPrisma } from './infrastructure/identidades.prisma.js';
import { InvitacionesPrisma } from './infrastructure/invitaciones.prisma.js';
import { MiembrosPrisma } from './infrastructure/miembros.prisma.js';
import {
  AceptarInvitacionController,
  InvitacionesController,
} from './interface/invitaciones.controller.js';
import { ZonaHorariaPrisma } from './infrastructure/zona-horaria.prisma.js';
import { AgenciasPrisma } from './infrastructure/agencias.prisma.js';
import { proveedorDeAuth } from './infrastructure/auth.provider.js';
import { ContadorDeFallosDeCodigo, LimitadorDeEnvios } from './application/limitador-de-envios.js';
import { crearLimitadorDeEnvios } from './infrastructure/crear-limitador-de-envios.js';
import { MembresiasPrisma } from './infrastructure/membresias.prisma.js';
import { ContadorDeFallosPostgres } from './infrastructure/contador-de-fallos.postgres.js';
import { PrismaIdentidadService } from './infrastructure/prisma-identidad.service.js';
import { SesionesBetterAuth } from './infrastructure/sesiones.better-auth.js';
import { MiembrosController } from './interface/miembros.controller.js';
import { AuthController } from './interface/auth.controller.js';
import { AjustesDeAgenciaUseCase } from './application/ajustes-de-agencia.use-case.js';
import { AgenciaAjustesController } from './interface/agencia-ajustes.controller.js';

/**
 * Identidad y acceso (ADR-0011).
 *
 * Exporta `ResolutorDeAcceso`: el puerto que el middleware de tenant, en `shared/`, usa para
 * preguntar quién llama sin importar este módulo (R4). Cualquier otro consumidor —el socket— lo
 * pide igual.
 */
/**
 * Global para que `ResolutorDeAcceso` se resuelva por su símbolo sin que nadie importe este módulo
 * (R4): lo usan el middleware de tenant y el gateway de tiempo real.
 */
@Global()
@Module({
  controllers: [
    AuthController,
    InvitacionesController,
    AceptarInvitacionController,
    MiembrosController,
    AgenciaAjustesController,
  ],
  providers: [
    PrismaIdentidadService,
    proveedorDeAuth,
    { provide: LimitadorDeEnvios, useFactory: crearLimitadorDeEnvios },
    { provide: ContadorDeFallosDeCodigo, useClass: ContadorDeFallosPostgres },
    ResolverAcceso,
    ObtenerSesionActual,
    CambiarAgenciaActiva,
    InvitarMiembroUseCase,
    AceptarInvitacionUseCase,
    DarDeBajaMiembroUseCase,
    ListarMiembrosUseCase,
    ListarMiembrosAsignablesUseCase,
    AjustesDeAgenciaUseCase,
    { provide: ResolutorDeAcceso, useExisting: ResolverAcceso },
    { provide: PuertoSesiones, useClass: SesionesBetterAuth },
    { provide: PuertoMembresias, useClass: MembresiasPrisma },
    { provide: PuertoAgencias, useClass: AgenciasPrisma },
    { provide: PuertoZonaHoraria, useClass: ZonaHorariaPrisma },
    { provide: PuertoInvitaciones, useClass: InvitacionesPrisma },
    { provide: PuertoIdentidades, useClass: IdentidadesPrisma },
    { provide: PuertoMiembros, useClass: MiembrosPrisma },
    // T-254: lo que `notifications` pide a `identity` (quién está activo y con qué permiso).
    { provide: PuertoUsuariosConPermiso, useClass: UsuariosConPermisoPrisma },
  ],
  exports: [ResolutorDeAcceso, PuertoUsuariosConPermiso],
})
export class IdentityModule {}
