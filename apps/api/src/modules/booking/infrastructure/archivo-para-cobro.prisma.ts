/**
 * `PuertoArchivoParaCobro` (T-330, ADR-0034 §1): lo único que `payments` sabe del archivo de viaje
 * —su total vendido, moneda, estado, fecha de salida y creación—, sin leer las tablas de `booking`
 * (R4). Nunca neto ni margen: esas columnas no se seleccionan.
 *
 * Corre en la transacción del llamador (RLS con el tenant de la sesión) y repite el predicado de
 * tenant (R1).
 */
import { Injectable } from '@nestjs/common';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  type ArchivoParaCobro,
  type OpcionesDeLectura,
  PuertoArchivoParaCobro,
} from '../../../shared/puertos/puertos-hacia-booking.js';

const SELECCION = {
  id: true,
  numero: true,
  contactoId: true,
  destino: true,
  fechaSalida: true,
  estado: true,
  ventaUnidades: true,
  monedaIso: true,
  creadoEn: true,
} as const;

interface FilaDeArchivo {
  id: string;
  numero: number;
  contactoId: string;
  destino: string;
  fechaSalida: Date;
  estado: 'ABIERTO' | 'CANCELADO';
  ventaUnidades: bigint;
  monedaIso: string;
  creadoEn: Date;
}

const dia = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class ArchivoParaCobroDeBooking extends PuertoArchivoParaCobro {
  async leer(
    tx: ClienteTenant,
    tenantId: string,
    travelFileId: string,
    opciones: OpcionesDeLectura = {},
  ): Promise<ArchivoParaCobro | null> {
    if (opciones.bloquear) {
      // El candado primero y en su propia sentencia; la lectura va después, con instantánea nueva
      // (READ COMMITTED): si una cancelación estaba en curso, aquí ya se ve confirmada.
      const bloqueada = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM travel_files
         WHERE id = ${travelFileId}::uuid AND tenant_id = ${tenantId}::uuid
           FOR SHARE`;
      if (bloqueada.length === 0) return null;
    }
    const f = await tx.travelFile.findFirst({
      where: { id: travelFileId, tenantId },
      select: SELECCION,
    });
    if (!f) return null;
    return this.aArchivo(tx, tenantId, f);
  }

  /**
   * `deAsesor` filtra por el asesor ACTUAL de la oportunidad del archivo (ADR-0035 §2). Es una
   * relación de Prisma y no SQL crudo: el `JOIN` lo genera por la foránea compuesta, que incluye
   * `tenant_id`, y la guardia de consultas sin filtro sigue viéndolo. Un archivo sin oportunidad
   * —o con una sin asesor— no casa con ningún id: no es «propio» de nadie (§2.2).
   */
  async listarAbiertos(
    tx: ClienteTenant,
    tenantId: string,
    filtros: { limite: number; deAsesor: string | null },
  ): Promise<ArchivoParaCobro[]> {
    const filas = await tx.travelFile.findMany({
      where: {
        tenantId,
        estado: 'ABIERTO',
        ...(filtros.deAsesor === null
          ? {}
          : { oportunidad: { is: { tenantId, asesorId: filtros.deAsesor } } }),
      },
      select: SELECCION,
      orderBy: [{ fechaSalida: 'asc' }, { numero: 'asc' }],
      take: filtros.limite,
    });
    const ids = filas.map((f) => f.id);
    const vencimientos = await this.pagosTotalesPorArchivo(tx, tenantId, ids);
    return filas.map((f) => ({
      ...this.base(f),
      pagoTotalVenceEn: vencimientos.get(f.id) ?? null,
    }));
  }

  private base(f: FilaDeArchivo): Omit<ArchivoParaCobro, 'pagoTotalVenceEn'> {
    return {
      id: f.id,
      numero: f.numero,
      contactoId: f.contactoId,
      destino: f.destino,
      fechaSalida: dia(f.fechaSalida),
      estado: f.estado,
      ventaUnidades: f.ventaUnidades,
      monedaIso: f.monedaIso,
      creadoEn: f.creadoEn,
    };
  }

  private async aArchivo(
    tx: ClienteTenant,
    tenantId: string,
    f: FilaDeArchivo,
  ): Promise<ArchivoParaCobro> {
    const venc = await this.pagosTotalesPorArchivo(tx, tenantId, [f.id]);
    return { ...this.base(f), pagoTotalVenceEn: venc.get(f.id) ?? null };
  }

  /** El pago total más próximo de las reservas vivas de cada archivo. */
  private async pagosTotalesPorArchivo(
    tx: ClienteTenant,
    tenantId: string,
    ids: string[],
  ): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const grupos = await tx.booking.groupBy({
      by: ['travelFileId'],
      where: {
        tenantId,
        travelFileId: { in: ids },
        estado: { notIn: ['CAIDA', 'CANCELADA'] },
        pagoTotalVenceEn: { not: null },
      },
      _min: { pagoTotalVenceEn: true },
    });
    const mapa = new Map<string, Date>();
    for (const g of grupos) {
      if (g._min.pagoTotalVenceEn) mapa.set(g.travelFileId, g._min.pagoTotalVenceEn);
    }
    return mapa;
  }
}
