import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

/**
 * Lo transversal. Es global para que ningún módulo de negocio tenga que importarlo —
 * y, sobre todo, para que ninguno pueda sustituirlo por otra conexión a la base de datos.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class SharedModule {}
