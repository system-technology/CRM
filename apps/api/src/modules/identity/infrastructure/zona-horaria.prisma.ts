/**
 * Cambia la zona horaria de la agencia llamando a `actualizar_zona_horaria_de_la_agencia` (migración
 * 20261116090000, ADR-0027) con el rol `viajapro_app` (R2). La función toma la agencia de
 * `app.current_tenant`; el parámetro va vinculado.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PuertoZonaHoraria } from '../domain/puertos.js';
import { AgenciaNoEncontradaError, ZonaHorariaInvalidaError } from '../application/errores.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';

/** SQLSTATE de una excepción de Prisma (`meta.code` en errores crudos, `code` si viene de pg). */
function sqlstateDe(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta === 'object' && meta !== null) {
    const codigo = (meta as { code?: unknown }).code;
    if (typeof codigo === 'string') return codigo;
  }
  const directo = (error as { code?: unknown }).code;
  return typeof directo === 'string' ? directo : undefined;
}

/** 22023 → 422, P0002 → 404; cualquier otra cosa se relanza tal cual. */
export function traducirErrorDeZonaHoraria(error: unknown): never {
  const sqlstate = sqlstateDe(error);
  if (sqlstate === '22023') throw new ZonaHorariaInvalidaError();
  if (sqlstate === 'P0002') throw new AgenciaNoEncontradaError();
  throw error;
}

@Injectable()
export class ZonaHorariaPrisma extends PuertoZonaHoraria {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async actualizar(zona: string): Promise<string> {
    try {
      const filas = await this.prisma.conTenant(
        (tx) =>
          tx.$queryRaw<
            Array<{ zona_horaria: string }>
          >`SELECT public.actualizar_zona_horaria_de_la_agencia(${zona}::text) AS zona_horaria`,
      );
      const guardada = filas[0]?.zona_horaria;
      if (guardada === undefined) throw new AgenciaNoEncontradaError();
      return guardada;
    } catch (error) {
      if (error instanceof AgenciaNoEncontradaError) throw error;
      return traducirErrorDeZonaHoraria(error);
    }
  }
}
