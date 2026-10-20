import { Global, Module } from '@nestjs/common';
import { ResolutorDeAcceso } from '../../shared/puertos/puerto-de-acceso.js';
import { CambiarAgenciaActiva } from './application/cambiar-agencia-activa.use-case.js';
import { ResolverAcceso } from './application/resolver-acceso.use-case.js';
import { ObtenerSesionActual } from './application/sesion-actual.use-case.js';
import { PuertoAgencias, PuertoMembresias, PuertoSesiones } from './domain/puertos.js';
import {
  PuertoIdentidades,
  PuertoInvitaciones,
  PuertoMiembros,
} from './domain/puertos-de-miembros.js';
import { AceptarInvitacionUseCase } from './application/aceptar-invitacion.use-case.js';
import { DarDeBajaMiembroUseCase } from './application/dar-de-baja-miembro.use-case.js';
import { InvitarMiembroUseCase } from './application/invitar-miembro.use-case.js';
import { IdentidadesPrisma } from './infrastructure/identidades.prisma.js';
import { InvitacionesPrisma } from './infrastructure/invitaciones.prisma.js';
import { MiembrosPrisma } from './infrastructure/miembros.prisma.js';
import {
  AceptarInvitacionController,
  InvitacionesController,
} from './interface/invitaciones.controller.js';
import { AgenciasPrisma } from './infrastructure/agencias.prisma.js';
import { proveedorDeAuth } from './infrastructure/auth.provider.js';
import { LimitadorDeEnvios } from './application/limitador-de-envios.js';
import { crearLimitadorDeEnvios } from './infrastructure/crear-limitador-de-envios.js';
import { MembresiasPrisma } from './infrastructure/membresias.prisma.js';
import { PrismaIdentidadService } from './infrastructure/prisma-identidad.service.js';
import { SesionesBetterAuth } from './infrastructure/sesiones.better-auth.js';
import { MiembrosController } from './interface/miembros.controller.js';
import { AuthController } from './interface/auth.controller.js';

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
  ],
  providers: [
    PrismaIdentidadService,
    proveedorDeAuth,
    { provide: LimitadorDeEnvios, useFactory: crearLimitadorDeEnvios },
    ResolverAcceso,
    ObtenerSesionActual,
    CambiarAgenciaActiva,
    InvitarMiembroUseCase,
    AceptarInvitacionUseCase,
    DarDeBajaMiembroUseCase,
    { provide: ResolutorDeAcceso, useExisting: ResolverAcceso },
    { provide: PuertoSesiones, useClass: SesionesBetterAuth },
    { provide: PuertoMembresias, useClass: MembresiasPrisma },
    { provide: PuertoAgencias, useClass: AgenciasPrisma },
    { provide: PuertoInvitaciones, useClass: InvitacionesPrisma },
    { provide: PuertoIdentidades, useClass: IdentidadesPrisma },
    { provide: PuertoMiembros, useClass: MiembrosPrisma },
  ],
  exports: [ResolutorDeAcceso],
})
export class IdentityModule {}
