/**
 * Escritura y lectura del historial de estados de la reserva (T-250).
 *
 * **Recibe la transacción del llamador y no abre otra.** La fila del historial y el UPDATE de la
 * reserva se confirman juntos o no se confirma ninguno, igual que el historial de etapas del CRM
 * (T-131). La tabla es de solo añadir: `viajapro_app` no tiene UPDATE ni DELETE sobre ella, así que
 * aquí no hay ni puede haber otra cosa que INSERT.
 *
 * Solo se escribe cuando el estado CAMBIA: corregir la nota, el localizador o un plazo no deja fila.
 * Sin neto ni texto libre (R8, R10).
 */
import type { EstadoReserva } from '@prisma/client';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import type { CambioDeEstadoDeReserva } from '../domain/reserva.js';

export interface CambioDeEstadoNuevo {
  tenantId: string;
  archivoId: string;
  reservaId: string;
  estadoAnterior: EstadoReserva;
  estadoNuevo: EstadoReserva;
  /** Nulo sin usuario (atajo de desarrollo). */
  usuarioId: string | null;
}

/** Añade las filas de los cambios que de verdad cambian el estado; ignora el resto. */
export async function registrarCambiosDeEstado(
  tx: ClienteTenant,
  cambios: readonly CambioDeEstadoNuevo[],
): Promise<void> {
  const reales = cambios.filter((c) => c.estadoAnterior !== c.estadoNuevo);
  if (reales.length === 0) return;
  await tx.reservaCambioEstado.createMany({ data: reales.map((c) => ({ ...c })) });
}

/** La línea de vida de un archivo, del cambio más antiguo al más reciente. */
export async function leerHistorialDelArchivo(
  tx: ClienteTenant,
  tenantId: string,
  archivoId: string,
): Promise<CambioDeEstadoDeReserva[]> {
  const filas = await tx.reservaCambioEstado.findMany({
    where: { tenantId, archivoId },
    orderBy: [{ ocurridoEn: 'asc' }, { id: 'asc' }],
  });
  return filas.map((f) => ({
    id: f.id,
    reservaId: f.reservaId,
    estadoAnterior: f.estadoAnterior,
    estadoNuevo: f.estadoNuevo,
    usuarioId: f.usuarioId,
    ocurridoEn: f.ocurridoEn,
  }));
}
