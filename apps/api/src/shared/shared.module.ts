import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermisoGuard } from './autorizacion/permiso.guard.js';
import { PrismaService } from './prisma/prisma.service.js';
import {
  crearAlmacenDeLimiteDeTasa,
  crearPoliticaDeLimiteDeTasa,
} from './red/limite-de-tasa/crear-limite-de-tasa.js';
import {
  ALMACEN_DE_LIMITE_DE_TASA,
  POLITICA_DE_LIMITE_DE_TASA,
} from './red/limite-de-tasa/limite-de-tasa.middleware.js';

/**
 * Lo transversal. Es global para que ningún módulo de negocio tenga que importarlo —
 * y, sobre todo, para que ninguno pueda sustituirlo por otra conexión a la base de datos.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: PermisoGuard },
    // La política se valida al construir el módulo: configuración inválida = la API no arranca.
    { provide: POLITICA_DE_LIMITE_DE_TASA, useFactory: () => crearPoliticaDeLimiteDeTasa() },
    {
      provide: ALMACEN_DE_LIMITE_DE_TASA,
      inject: [POLITICA_DE_LIMITE_DE_TASA],
      useFactory: crearAlmacenDeLimiteDeTasa,
    },
  ],
  exports: [PrismaService, POLITICA_DE_LIMITE_DE_TASA, ALMACEN_DE_LIMITE_DE_TASA],
})
export class SharedModule {}
