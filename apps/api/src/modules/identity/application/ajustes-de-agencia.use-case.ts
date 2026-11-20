/**
 * `GET /api/v1/agencia/ajustes`: nombre, país, moneda, zona horaria y RNT de la agencia activa.
 *
 * Cualquier miembro autenticado: la web necesita la zona para formatear fechas (R9). El tenant
 * sale de la sesión; `tenants` es global (sin RLS), así que el predicado `id` va explícito.
 * La zona (`actualizar`) no es un UPDATE: la app no tiene UPDATE sobre `tenants` y pasa por el
 * puerto, que llama a la función SECURITY DEFINER (ADR-0027).
 *
 * El RNT vive en `perfiles_de_agencia` (T-261, ADR-0030 §3.3), una tabla de agencia con RLS: se
 * lee y se escribe con el contexto del tenant. `rntVerificado` solo sale `true` si la plataforma
 * lo verificó; esta clase nunca escribe `verificado_en`.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AjustesDeAgencia, CambiarAjustesDeAgencia } from '@viajapro/contracts';
import { PuertoZonaHoraria } from '../domain/puertos.js';
import { AgenciaNoEncontradaError } from './errores.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';

@Injectable()
export class AjustesDeAgenciaUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoZonaHoraria) private readonly zona: PuertoZonaHoraria,
  ) {}

  /**
   * Aplica lo que viene en el cuerpo. La zona va primero: es lo único que puede fallar por una
   * regla de dominio (422), y así un cuerpo con zona inválida no deja el RNT a medias.
   */
  async actualizar(cambios: CambiarAjustesDeAgencia): Promise<AjustesDeAgencia> {
    if (cambios.zonaHoraria !== undefined) await this.zona.actualizar(cambios.zonaHoraria);
    if (cambios.rnt !== undefined) await this.guardarRnt(cambios.rnt);
    return this.obtener();
  }

  /**
   * Upsert del perfil bajo RLS. La verificación NO se toca desde aquí: el disparador de la base la
   * anula si el RNT cambia y la conserva si no, y `viajapro_app` no puede fijarla (T-261).
   */
  private async guardarRnt(rnt: string | null): Promise<void> {
    const { tenantId } = ContextoTenant.obtener();
    await this.prisma.conTenant((tx) =>
      tx.perfilDeAgencia.upsert({
        where: { tenantId },
        create: { tenantId, rnt },
        update: { rnt },
      }),
    );
  }

  async obtener(): Promise<AjustesDeAgencia> {
    const { tenantId } = ContextoTenant.obtener();
    const { fila, perfil } = await this.prisma.conTenant(async (tx) => ({
      fila: await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { nombre: true, paisIso: true, monedaIso: true, zonaHoraria: true },
      }),
      perfil: await tx.perfilDeAgencia.findUnique({
        where: { tenantId },
        select: { rnt: true, verificadoEn: true },
      }),
    }));
    if (!fila) throw new AgenciaNoEncontradaError();
    return {
      ...fila,
      rnt: perfil?.rnt ?? null,
      rntVerificado: perfil?.rnt != null && perfil.verificadoEn != null,
    };
  }
}
