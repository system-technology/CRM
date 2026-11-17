/**
 * `PuertoVersionAceptada` (ADR-0024 §3.1): la versión que vio el cliente de una cotización ACEPTADA,
 * para que `booking` abra el archivo de viaje sin leer tablas de `quoting`.
 *
 * Corre en la transacción del despachador (RLS con el tenant de la fila del outbox) y repite el
 * predicado de tenant en cada consulta: si la cotización es de otra agencia, RLS no la devuelve y
 * la respuesta es `null`.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  type LineaDeVersionAceptada,
  PuertoVersionAceptada,
  type TrmDeVersionAceptada,
  type VersionAceptada,
} from '../../../shared/puertos/puertos-hacia-quoting.js';

/**
 * Lo único que se lee de cada línea del JSON congelado. Tolerante a propósito: las versiones
 * anteriores a ADR-0024 §2 no traen `mayoristaId`, y `margen` solo viene si se calculó.
 */
const LineaCongelada = z.object({
  mayoristaId: z.string().uuid().nullish(),
  total: z.object({ unidades: z.string().regex(/^-?\d+$/) }),
  margen: z.object({ unidades: z.string().regex(/^-?\d+$/) }).nullish(),
});

const aFecha = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class VersionAceptadaDeQuoting extends PuertoVersionAceptada {
  async leer(
    tx: ClienteTenant,
    tenantId: string,
    cotizacionId: string,
    version: number,
  ): Promise<VersionAceptada | null> {
    const cotizacion = await tx.cotizacion.findFirst({
      where: {
        id: cotizacionId,
        tenantId,
        estado: 'ACEPTADA',
        versionEnviada: version,
        eliminadoEn: null,
      },
      select: { contactoId: true, oportunidadId: true },
    });
    if (!cotizacion) return null;

    const v = await tx.versionCotizacion.findFirst({
      where: { tenantId, cotizacionId, numero: version },
    });
    if (!v) return null;

    const lineasCongeladas = z.array(LineaCongelada).parse(v.lineas);
    const ids = [
      ...new Set(lineasCongeladas.map((l) => l.mayoristaId).filter((id): id is string => !!id)),
    ];
    const nombres = new Map<string, string>();
    if (ids.length > 0) {
      const filas = await tx.mayorista.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, nombre: true },
      });
      for (const f of filas) nombres.set(f.id, f.nombre);
    }

    const lineas: LineaDeVersionAceptada[] = lineasCongeladas.map((l) => ({
      mayoristaId: l.mayoristaId ?? null,
      mayoristaNombre: l.mayoristaId ? (nombres.get(l.mayoristaId) ?? null) : null,
      // neto = venta − margen; sin margen calculado, desconocido (no cero).
      netoUnidades: l.margen ? BigInt(l.total.unidades) - BigInt(l.margen.unidades) : null,
    }));

    const trm: TrmDeVersionAceptada | null =
      v.trmMonedaOrigen && v.trmMonedaDestino && v.trmValor && v.trmFecha && v.trmFuente
        ? {
            monedaOrigen: v.trmMonedaOrigen,
            monedaDestino: v.trmMonedaDestino,
            valor: v.trmValor.toFixed(6),
            fecha: aFecha(v.trmFecha),
            fuente: v.trmFuente,
          }
        : null;

    return {
      cotizacionId,
      version,
      contactoId: cotizacion.contactoId,
      oportunidadId: cotizacion.oportunidadId,
      paqueteNombre: v.paqueteNombre,
      destino: v.destino,
      fechaSalida: aFecha(v.fechaSalida),
      noches: v.noches,
      adultos: v.adultos,
      ninos: v.ninos,
      infantes: v.infantes,
      ventaUnidades: v.ventaUnidades,
      netoUnidades: v.netoUnidades,
      monedaIso: v.monedaIso,
      trm,
      lineas,
    };
  }
}
