/**
 * `PuertoArchivoDeUnAviso` (T-254): lo único que `notifications` sabe del archivo de una reserva
 * —su número de file y de qué oportunidad viene—, para avisar al asesor sin leer las tablas de
 * `booking` (R4).
 *
 * Corre en la transacción del despachador (RLS con el tenant de la fila del outbox) y repite el
 * predicado de tenant (R1). La reserva se filtra por `id AND travel_file_id`: un aviso que apunte a
 * una reserva de otro archivo no encuentra nada.
 */
import { Injectable } from '@nestjs/common';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import {
  type ArchivoDeUnAviso,
  PuertoArchivoDeUnAviso,
} from '../../../shared/puertos/puertos-para-avisos.js';

@Injectable()
export class ArchivoDeUnAvisoDeBooking extends PuertoArchivoDeUnAviso {
  async leer(
    tx: ClienteTenant,
    tenantId: string,
    archivoId: string,
    reservaId: string,
  ): Promise<ArchivoDeUnAviso | null> {
    const reserva = await tx.booking.findFirst({
      where: { id: reservaId, tenantId, travelFileId: archivoId },
      select: { travelFile: { select: { numero: true, oportunidadId: true } } },
    });
    if (!reserva) return null;
    return {
      numero: reserva.travelFile.numero,
      oportunidadId: reserva.travelFile.oportunidadId,
    };
  }
}
