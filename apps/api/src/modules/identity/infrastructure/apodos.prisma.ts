/**
 * Apodo → identidad y correo, con el pool de identidad (`viajapro_identidad`, sin tenant).
 *
 * UNA sola consulta, no dos condicionales (ADR-0031 §3): `accesos_identidad` unida a `identidades`
 * con `eliminado_en IS NULL`. `accesos_identidad` es un índice, no una autoridad: que el apodo
 * resuelva a una identidad no concede nada; después hacen falta la contraseña y el paso 4 bajo RLS.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PuertoApodos } from '../domain/puertos-de-apodos.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

@Injectable()
export class ApodosPrisma extends PuertoApodos {
  constructor(@Inject(PrismaIdentidadService) private readonly prisma: PrismaIdentidadService) {
    super();
  }

  async resolverCorreo(apodo: string): Promise<{ identidadId: string; correo: string } | null> {
    const [fila] = await this.prisma.$queryRaw<Array<{ identidadId: string; correo: string }>>`
      SELECT a.identidad_id::text AS "identidadId", i.correo::text AS "correo"
        FROM accesos_identidad a
        JOIN identidades i ON i.id = a.identidad_id
       WHERE a.apodo = ${apodo} AND i.eliminado_en IS NULL
       LIMIT 1`;
    return fila ?? null;
  }
}
