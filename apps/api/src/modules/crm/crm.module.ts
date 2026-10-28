/**
 * Contexto delimitado `crm`: contactos y oportunidades.
 *
 * No importa ningún otro módulo de negocio, ni lo hará (R4). La ficha del contacto devuelve los
 * arreglos de cotizaciones y archivos de viaje vacíos hasta que `quoting` y `booking` publiquen
 * sus puertos: un arreglo vacío es honesto, y consultar sus tablas desde aquí sería atravesar
 * una frontera por comodidad.
 */

import { Module } from '@nestjs/common';
import { CrearOportunidadUseCase } from './application/crear-oportunidad.js';
import { GestionarContactos } from './application/gestionar-contactos.js';
import { GestionarSeguimientos } from './application/gestionar-seguimientos.js';
import { MoverOportunidadUseCase } from './application/mover-oportunidad.js';
import { PuertoCrm } from './application/puerto-crm.js';
import { PuertoEscrituraCrm } from './application/puerto-escritura-crm.js';
import { PuertoSeguimientos } from './application/puerto-seguimientos.js';
import { VerTablero } from './application/ver-tablero.js';
import { CrmPuertosModule } from './crm-puertos.module.js';
import { CrmPrisma } from './infrastructure/crm.prisma.js';
import { EscrituraCrmPrisma } from './infrastructure/escritura-crm.prisma.js';
import { SeguimientosPrisma } from './infrastructure/seguimientos.prisma.js';
import { CrmController } from './interface/crm.controller.js';

@Module({
  imports: [CrmPuertosModule],
  controllers: [CrmController],
  providers: [
    VerTablero,
    MoverOportunidadUseCase,
    GestionarContactos,
    CrearOportunidadUseCase,
    GestionarSeguimientos,
    { provide: PuertoCrm, useClass: CrmPrisma },
    { provide: PuertoEscrituraCrm, useClass: EscrituraCrmPrisma },
    // Tabla `seguimientos` (T-082). Sustituye al provisional sobre `proxima_tarea_*`.
    { provide: PuertoSeguimientos, useClass: SeguimientosPrisma },
  ],
})
export class CrmModule {}
