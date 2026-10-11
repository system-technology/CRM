/**
 * Contexto delimitado `crm`: contactos y oportunidades.
 *
 * No importa ningún otro módulo de negocio, ni lo hará (R4). La ficha del contacto devuelve los
 * arreglos de cotizaciones y archivos de viaje vacíos hasta que `quoting` y `booking` publiquen
 * sus puertos: un arreglo vacío es honesto, y consultar sus tablas desde aquí sería atravesar
 * una frontera por comodidad.
 */

import { Module } from '@nestjs/common';
import { MoverOportunidadUseCase } from './application/mover-oportunidad.js';
import { PuertoCrm } from './application/puerto-crm.js';
import { VerTablero } from './application/ver-tablero.js';
import { CrmPrisma } from './infrastructure/crm.prisma.js';
import { CrmController } from './interface/crm.controller.js';

@Module({
  controllers: [CrmController],
  providers: [VerTablero, MoverOportunidadUseCase, { provide: PuertoCrm, useClass: CrmPrisma }],
})
export class CrmModule {}
