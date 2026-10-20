import { Module } from '@nestjs/common';
import { ResolutorDeAcceso } from '../../shared/puertos/puerto-de-acceso.js';
import { CambiarAgenciaActiva } from './application/cambiar-agencia-activa.use-case.js';
import { ResolverAcceso } from './application/resolver-acceso.use-case.js';
import { ObtenerSesionActual } from './application/sesion-actual.use-case.js';
import { PuertoAgencias, PuertoMembresias, PuertoSesiones } from './domain/puertos.js';
import { AgenciasPrisma } from './infrastructure/agencias.prisma.js';
import { proveedorDeAuth } from './infrastructure/auth.provider.js';
import { MembresiasPrisma } from './infrastructure/membresias.prisma.js';
import { PrismaIdentidadService } from './infrastructure/prisma-identidad.service.js';
import { SesionesBetterAuth } from './infrastructure/sesiones.better-auth.js';
import { AuthController } from './interface/auth.controller.js';

/**
 * Identidad y acceso (ADR-0011).
 *
 * Exporta `ResolutorDeAcceso`: el puerto que el middleware de tenant, en `shared/`, usa para
 * preguntar quién llama sin importar este módulo (R4). Cualquier otro consumidor —el socket— lo
 * pide igual.
 */
@Module({
  controllers: [AuthController],
  providers: [
    PrismaIdentidadService,
    proveedorDeAuth,
    ResolverAcceso,
    ObtenerSesionActual,
    CambiarAgenciaActiva,
    { provide: ResolutorDeAcceso, useExisting: ResolverAcceso },
    { provide: PuertoSesiones, useClass: SesionesBetterAuth },
    { provide: PuertoMembresias, useClass: MembresiasPrisma },
    { provide: PuertoAgencias, useClass: AgenciasPrisma },
  ],
  exports: [ResolutorDeAcceso],
})
export class IdentityModule {}
