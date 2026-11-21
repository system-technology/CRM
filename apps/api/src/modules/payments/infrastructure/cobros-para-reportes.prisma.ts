/**
 * El adaptador con el que `payments` responde a `analytics` (`PuertoCobrosParaReportes`, T-528):
 * cuánto falta por cobrar, con el alcance ya decidido por la sesión (ADR-0035 §1).
 *
 * **No duplica la fórmula del saldo en SQL** (ADR-0035 §4): devuelve, por archivo abierto, la
 * venta y las sumas de sus movimientos vigentes, y es `analytics` quien aplica las funciones puras
 * de `packages/domain` (`cobro.ts`). Por eso este puerto sí devuelve filas, al contrario que los
 * demás de `puertos-de-reportes.ts`, y por eso lleva tope: hasta `tope` archivos abiertos, con una
 * fila de más para saber si hubo recorte. Pasarlo a SQL es T-492, con prueba de contrato.
 *
 * **No toca las tablas de `booking`**: el archivo lo lee por `PuertoArchivoParaCobro`, el mismo
 * puerto con el que ya trabaja el libro de cobro (ADR-0034 §1, R4). Ese puerto es quien traduce el
 * asesor del alcance a la oportunidad del archivo (ADR-0035 §2).
 *
 * Todo corre en una transacción corta bajo el tenant de la petición (RLS) y con el `tenantId`
 * explícito en cada predicado (R1). Ni PII de viajeros ni neto del mayorista salen de aquí (R10).
 */
import { Inject, Injectable } from '@nestjs/common';
import { esCodigoMoneda, SUMAS_EN_CERO } from '@viajapro/domain';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { AlcanceDeReporte } from '../../../shared/autorizacion/alcance-de-reporte.js';
import {
  type ArchivoPorCobrar,
  type CobrosAgregados,
  PuertoCobrosParaReportes,
} from '../../../shared/puertos/puertos-de-reportes.js';
import { PuertoArchivoParaCobro } from '../../../shared/puertos/puertos-hacia-booking.js';
import { MonedaDesconocidaEnElLibroError } from '../domain/errors.js';
import { sumasVigentesPorArchivo } from './cobros.prisma.js';

@Injectable()
export class CobrosParaReportesPrisma extends PuertoCobrosParaReportes {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PuertoArchivoParaCobro) private readonly archivos: PuertoArchivoParaCobro,
  ) {
    super();
  }

  async porCobrar(
    tenantId: string,
    alcance: AlcanceDeReporte,
    tope: number,
  ): Promise<CobrosAgregados> {
    return this.prisma.conTenant(async (tx) => {
      // El alcance se traduce AQUÍ a un filtro de asesor, igual que en los demás adaptadores de
      // reportes: `null` solo cuando el alcance es de agencia y no pidió asesor.
      const leidos = await this.archivos.listarAbiertos(tx, tenantId, {
        limite: tope + 1,
        deAsesor: alcance.asesorId,
      });
      const archivos = leidos.slice(0, tope);
      const sumas = await sumasVigentesPorArchivo(
        tx,
        tenantId,
        archivos.map((a) => a.id),
      );

      return {
        archivos: archivos.map((a): ArchivoPorCobrar => {
          if (!esCodigoMoneda(a.monedaIso)) throw new MonedaDesconocidaEnElLibroError(a.monedaIso);
          return {
            moneda: a.monedaIso,
            estado: a.estado,
            ventaUnidades: a.ventaUnidades,
            sumas: sumas.get(a.id) ?? { ...SUMAS_EN_CERO },
          };
        }),
        truncado: leidos.length > tope,
      };
    });
  }
}
