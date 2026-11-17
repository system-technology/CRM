/**
 * El archivo de viaje en PostgreSQL, en la transacción del despachador (RLS con el tenant de la fila
 * del outbox). El `tenantId` va además en cada predicado y en cada fila escrita (R1).
 */
import { Injectable } from '@nestjs/common';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  RepositorioDeArchivos,
  type ResultadoDeApertura,
} from '../application/puertos-de-archivos.js';
import type { ArchivoPorAbrir } from '../domain/archivo-de-viaje.js';

/** `AAAA-MM-DD` a la medianoche UTC: las columnas `date` no tienen zona (R9). */
const aDia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

@Injectable()
export class RepositorioDeArchivosPrisma extends RepositorioDeArchivos {
  async abrir(
    tx: ClienteTenant,
    tenantId: string,
    archivo: ArchivoPorAbrir,
  ): Promise<ResultadoDeApertura> {
    const { venta } = archivo;

    // El número de file es `max + 1` por agencia. El candado de transacción serializa las aperturas
    // de UNA agencia (otras agencias no se esperan): sin él, dos aperturas a la vez calcularían el
    // mismo número, una chocaría con el UNIQUE y gastaría un intento de entrega. `$executeRaw` y
    // no `$queryRaw`: la función devuelve `void`, que Prisma no sabe deserializar.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`travel_files:${tenantId}`}, 0))`;

    // Idempotencia por cotización (segunda red; la primera es la fila de `entregas_de_eventos`).
    const existente = await tx.travelFile.findFirst({
      where: { tenantId, cotizacionId: venta.cotizacionId },
      select: { id: true, numero: true },
    });
    if (existente) {
      return { travelFileId: existente.id, numero: existente.numero, creado: false };
    }

    const maximo = await tx.travelFile.aggregate({ where: { tenantId }, _max: { numero: true } });
    const numero = (maximo._max.numero ?? 0) + 1;

    const creado = await tx.travelFile.create({
      data: {
        tenantId,
        numero,
        contactoId: venta.contactoId,
        oportunidadId: venta.oportunidadId,
        cotizacionId: venta.cotizacionId,
        versionCotizacion: venta.version,
        paqueteNombre: venta.paqueteNombre,
        destino: venta.destino,
        fechaSalida: aDia(venta.fechaSalida),
        noches: venta.noches,
        adultos: venta.adultos,
        ninos: venta.ninos,
        infantes: venta.infantes,
        ventaUnidades: venta.ventaUnidades,
        monedaIso: venta.monedaIso,
        trmMonedaOrigen: venta.trm?.monedaOrigen ?? null,
        trmMonedaDestino: venta.trm?.monedaDestino ?? null,
        trmValor: venta.trm?.valor ?? null,
        trmFecha: venta.trm ? aDia(venta.trm.fecha) : null,
        trmFuente: venta.trm?.fuente ?? null,
        // Estado ABIERTO por defecto. Sin autor: lo abre el consumidor del evento, no un usuario.
      },
      select: { id: true },
    });

    await tx.booking.createMany({
      data: archivo.reservas.map((r) => ({
        tenantId,
        travelFileId: creado.id,
        mayoristaId: r.mayoristaId,
        mayoristaNombre: r.mayoristaNombre,
        netoUnidades: r.netoUnidades,
        monedaIso: r.monedaIso,
        // Estado PENDIENTE por defecto: aún no se pidió el cupo.
      })),
    });

    return { travelFileId: creado.id, numero, creado: true };
  }
}
