/**
 * El adaptador con el que `quoting` responde a `inbox` (`PuertoCotizacionParaWhatsapp`): lee una
 * versión congelada bajo RLS y devuelve el texto ya armado. Solo lectura, una transacción corta.
 *
 * Los cargos en destino NO se congelan en la versión (viven en el paquete): se leen del paquete
 * tal como está hoy. Aviso para `dueno-de-producto`: si la agencia cambia un cargo después de
 * cotizar, el texto enviado muestra el vigente.
 */
import { Inject, Injectable } from '@nestjs/common';
import { CargoEnDestino } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  type CotizacionParaWhatsapp,
  PuertoCotizacionParaWhatsapp,
} from '../../../shared/puertos/puertos-hacia-quoting.js';
import { aVersionDeCotizacion } from '../application/cotizacion-guardada.mapper.js';
import { textoDeCotizacionParaWhatsapp } from '../domain/texto-de-cotizacion-whatsapp.js';

@Injectable()
export class CotizacionParaWhatsappPrisma extends PuertoCotizacionParaWhatsapp {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async textoDeVersion(
    tenantId: string,
    cotizacionId: string,
    version: number | undefined,
  ): Promise<CotizacionParaWhatsapp | null> {
    return this.prisma.conTenant(async (tx) => {
      // Predicado de tenant explícito MÁS RLS (defensa en profundidad).
      const c = await tx.cotizacion.findFirst({
        where: { id: cotizacionId, tenantId, eliminadoEn: null },
        select: { id: true, contactoId: true },
      });
      if (!c) return null;
      const v = await tx.versionCotizacion.findFirst({
        where: { cotizacionId, tenantId, ...(version === undefined ? {} : { numero: version }) },
        orderBy: { numero: 'desc' },
      });
      if (!v) return null;
      const paquete = await tx.paquete.findFirst({
        where: { id: v.paqueteId, tenantId },
        select: { cargosEnDestino: true },
      });
      const cargos = Array.isArray(paquete?.cargosEnDestino)
        ? paquete.cargosEnDestino.flatMap((crudo) => {
            const r = CargoEnDestino.safeParse(crudo);
            return r.success ? [r.data] : [];
          })
        : [];
      // `incluirMargen = false`: el texto del viajero nunca lleva neto ni margen.
      const texto = textoDeCotizacionParaWhatsapp(aVersionDeCotizacion(v, false), cargos);
      return { cotizacionId: c.id, contactoId: c.contactoId, version: v.numero, texto };
    });
  }
}
