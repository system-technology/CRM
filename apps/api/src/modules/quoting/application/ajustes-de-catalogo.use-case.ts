/**
 * Ajustes de catálogo de la agencia: hoy solo `promo_vencida` (ADR-0017 §9, D3), la política que
 * decide qué se MUESTRA cuando una promo vence. Es presentación, nunca cálculo: cambiarla no
 * toca ninguna venta ni ninguna cotización ya guardada.
 *
 * El tenant sale de la sesión; la lectura y la escritura van por `conTenant` (RLS) con el
 * predicado explícito. El cambio se audita en la misma transacción, con el antes y el después.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { ActualizarAjustesDeCatalogo, AjustesDeCatalogo } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { leerPromoVencida } from './presentacion-de-precios.js';

export const ACCION_AJUSTES_MODIFICADOS = 'catalogo.ajustes.modificado';

@Injectable()
export class AjustesDeCatalogoUseCase {
  // `@Inject` explícito: ver la nota de `listar-paquetes.use-case.ts`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async obtener(): Promise<AjustesDeCatalogo> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => ({
      promoVencida: await leerPromoVencida(tx, tenantId),
    }));
  }

  async actualizar(cambio: ActualizarAjustesDeCatalogo): Promise<AjustesDeCatalogo> {
    const { tenantId, usuarioId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const existe = await tx.politicaDePrecio.findUnique({
        where: { tenantId },
        select: { promoVencida: true },
      });
      const antes = existe?.promoVencida ?? (await leerPromoVencida(tx, tenantId));
      const despues = cambio.promoVencida ?? antes;

      if (existe) {
        await tx.politicaDePrecio.update({ where: { tenantId }, data: { promoVencida: despues } });
      } else {
        await tx.politicaDePrecio.create({ data: { tenantId, promoVencida: despues } });
      }

      await tx.registroAuditoria.create({
        data: {
          tenantId,
          usuarioId,
          accion: ACCION_AJUSTES_MODIFICADOS,
          entidad: 'politica_de_precio',
          entidadId: tenantId,
          detalle: { antes: { promoVencida: antes }, despues: { promoVencida: despues } },
        },
      });
      return { promoVencida: despues };
    });
  }
}
