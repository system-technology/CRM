/**
 * La operación del archivo de viaje en PostgreSQL (T-242), siempre bajo el tenant de la petición
 * (`PrismaService.conTenant` fija `app.current_tenant`; RLS lo hace cumplir). Además, el `tenantId`
 * va en cada predicado y en cada fila escrita (R1), y la reserva se filtra por `id AND
 * travel_file_id`: una reserva no se opera desde la URL de otro archivo de la misma agencia.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type FiltroDeArchivos,
  type OperacionesDelArchivo,
  RepositorioDeOperacionDeArchivos,
} from '../application/puertos-de-operacion.js';
import type { Archivo, CancelacionDelArchivo, PasajeroNuevo } from '../domain/archivo.js';
import {
  ArchivoNoEncontradoError,
  ReservaNoEncontradaError,
} from '../domain/errors-de-operacion.js';
import { marcasALimpiar } from '../domain/plazos.js';
import type { CambioDeEstadoDeReserva, Reserva } from '../domain/reserva.js';
import {
  leerHistorialDelArchivo,
  registrarCambiosDeEstado,
} from './historial-de-reservas.prisma.js';

const CON_RESERVAS = { reservas: { orderBy: { id: 'asc' } } } satisfies Prisma.TravelFileInclude;
const CON_TODO = {
  reservas: { orderBy: { id: 'asc' } },
  pasajeros: { orderBy: { orden: 'asc' } },
} satisfies Prisma.TravelFileInclude;

type FilaDeArchivo = Prisma.TravelFileGetPayload<{ include: typeof CON_TODO }>;
type FilaDeReserva = FilaDeArchivo['reservas'][number];

const aReserva = (f: FilaDeReserva): Reserva => ({
  id: f.id,
  mayoristaId: f.mayoristaId,
  mayoristaNombre: f.mayoristaNombre,
  netoUnidades: f.netoUnidades,
  monedaIso: f.monedaIso,
  localizador: f.localizador,
  estado: f.estado,
  solicitadaEn: f.solicitadaEn,
  confirmadaEn: f.confirmadaEn,
  abonadaEn: f.abonadaEn,
  pagadaEn: f.pagadaEn,
  timeLimit: f.timeLimit,
  pagoTotalVenceEn: f.pagoTotalVenceEn,
  motivoCaida: f.motivoCaida,
  nota: f.nota,
  avisoTimeLimitProximoEn: f.avisoTimeLimitProximoEn,
  avisoTimeLimitVencidoEn: f.avisoTimeLimitVencidoEn,
  avisoPagoTotalProximoEn: f.avisoPagoTotalProximoEn,
  avisoPagoTotalVencidoEn: f.avisoPagoTotalVencidoEn,
});

const dia = (d: Date): string => d.toISOString().slice(0, 10);

/** `pasajeros` puede faltar (la lista no los carga). */
function aArchivo(
  f: Omit<FilaDeArchivo, 'pasajeros'> & { pasajeros?: FilaDeArchivo['pasajeros'] },
): Archivo {
  return {
    id: f.id,
    numero: f.numero,
    contactoId: f.contactoId,
    oportunidadId: f.oportunidadId,
    cotizacionId: f.cotizacionId,
    versionCotizacion: f.versionCotizacion,
    paqueteNombre: f.paqueteNombre,
    destino: f.destino,
    fechaSalida: dia(f.fechaSalida),
    noches: f.noches,
    adultos: f.adultos,
    ninos: f.ninos,
    infantes: f.infantes,
    ventaUnidades: f.ventaUnidades,
    monedaIso: f.monedaIso,
    trm:
      f.trmMonedaOrigen && f.trmMonedaDestino && f.trmValor && f.trmFecha && f.trmFuente
        ? {
            monedaOrigen: f.trmMonedaOrigen,
            monedaDestino: f.trmMonedaDestino,
            valor: f.trmValor.toString(),
            fecha: dia(f.trmFecha),
            fuente: f.trmFuente,
          }
        : null,
    estado: f.estado,
    motivoCancelacion: f.motivoCancelacion,
    notaCancelacion: f.notaCancelacion,
    canceladoEn: f.canceladoEn,
    creadoEn: f.creadoEn,
    reservas: f.reservas.map(aReserva),
    pasajeros: (f.pasajeros ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      edadAlViaje: p.edadAlViaje,
      esTitular: p.esTitular,
      orden: p.orden,
    })),
  };
}

class OperacionesPrisma implements OperacionesDelArchivo {
  constructor(
    private readonly tx: ClienteTenant,
    private readonly tenantId: string,
  ) {}

  async leerBloqueado(archivoId: string): Promise<Archivo | null> {
    // El candado primero, y filtrado por agencia además de RLS. `$queryRaw` porque Prisma no
    // expone `FOR UPDATE`. Sin fila = no existe en esta agencia.
    const bloqueada = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM travel_files
       WHERE id = ${archivoId}::uuid AND tenant_id = ${this.tenantId}::uuid
         FOR UPDATE`;
    if (bloqueada.length === 0) return null;
    const f = await this.tx.travelFile.findFirst({
      where: { id: archivoId, tenantId: this.tenantId },
      include: CON_TODO,
    });
    return f ? aArchivo(f) : null;
  }

  async zonaHoraria(): Promise<string> {
    const t = await this.tx.tenant.findUnique({
      where: { id: this.tenantId },
      select: { zonaHoraria: true },
    });
    return t?.zonaHoraria ?? 'America/Bogota';
  }

  async guardarReserva(
    archivoId: string,
    r: Reserva,
    actorId: string | null,
    anterior: Reserva,
  ): Promise<void> {
    const limpiar = marcasALimpiar(anterior, r);
    const { count } = await this.tx.booking.updateMany({
      where: { id: r.id, travelFileId: archivoId, tenantId: this.tenantId },
      data: {
        estado: r.estado,
        localizador: r.localizador,
        nota: r.nota,
        solicitadaEn: r.solicitadaEn,
        confirmadaEn: r.confirmadaEn,
        abonadaEn: r.abonadaEn,
        pagadaEn: r.pagadaEn,
        timeLimit: r.timeLimit,
        pagoTotalVenceEn: r.pagoTotalVenceEn,
        motivoCaida: r.motivoCaida,
        // Las marcas de aviso solo se tocan si cambió el plazo (ver `marcasALimpiar`).
        ...(limpiar.timeLimit
          ? { avisoTimeLimitProximoEn: null, avisoTimeLimitVencidoEn: null }
          : {}),
        ...(limpiar.pagoTotal
          ? { avisoPagoTotalProximoEn: null, avisoPagoTotalVencidoEn: null }
          : {}),
        actualizadoPorId: actorId,
      },
    });
    if (count !== 1) throw new ReservaNoEncontradaError(archivoId, r.id);
    // T-250: en la misma transacción. Solo si el estado cambió (corregir nota o localizador, no).
    await registrarCambiosDeEstado(this.tx, [
      {
        tenantId: this.tenantId,
        archivoId,
        reservaId: r.id,
        estadoAnterior: anterior.estado,
        estadoNuevo: r.estado,
        usuarioId: actorId,
      },
    ]);
  }

  async reemplazarPasajeros(
    archivoId: string,
    pasajeros: readonly PasajeroNuevo[],
    actorId: string | null,
  ): Promise<void> {
    // Primero se borra: el índice parcial del titular único no admite dos a la vez.
    await this.tx.passenger.deleteMany({
      where: { tenantId: this.tenantId, travelFileId: archivoId },
    });
    if (pasajeros.length === 0) return;
    await this.tx.passenger.createMany({
      data: pasajeros.map((p, orden) => ({
        tenantId: this.tenantId,
        travelFileId: archivoId,
        nombre: p.nombre,
        tipo: p.tipo,
        edadAlViaje: p.edadAlViaje,
        esTitular: p.esTitular,
        orden,
        creadoPorId: actorId,
        actualizadoPorId: actorId,
      })),
    });
  }

  async guardarCancelacion(archivoId: string, c: CancelacionDelArchivo): Promise<void> {
    if (c.reservasACancelar.length > 0) {
      // El estado de origen se lee aquí, con el archivo ya bloqueado: el historial dice de dónde
      // venía cada reserva (T-250).
      const previas = await this.tx.booking.findMany({
        where: {
          tenantId: this.tenantId,
          travelFileId: archivoId,
          id: { in: c.reservasACancelar },
        },
        select: { id: true, estado: true },
      });
      await this.tx.booking.updateMany({
        where: {
          tenantId: this.tenantId,
          travelFileId: archivoId,
          id: { in: c.reservasACancelar },
        },
        data: { estado: 'CANCELADA', actualizadoPorId: c.canceladoPor },
      });
      await registrarCambiosDeEstado(
        this.tx,
        previas.map((p) => ({
          tenantId: this.tenantId,
          archivoId,
          reservaId: p.id,
          estadoAnterior: p.estado,
          estadoNuevo: 'CANCELADA' as const,
          usuarioId: c.canceladoPor,
        })),
      );
    }
    const { count } = await this.tx.travelFile.updateMany({
      where: { id: archivoId, tenantId: this.tenantId },
      data: {
        estado: 'CANCELADO',
        motivoCancelacion: c.motivo,
        notaCancelacion: c.nota,
        canceladoEn: c.canceladoEn,
        canceladoPorId: c.canceladoPor,
        actualizadoPorId: c.canceladoPor,
      },
    });
    if (count !== 1) throw new ArchivoNoEncontradoError(archivoId);
  }
}

@Injectable()
export class RepositorioDeOperacionDeArchivosPrisma extends RepositorioDeOperacionDeArchivos {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  listar(filtro: FiltroDeArchivos): Promise<Archivo[]> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      // T-251: el orden de «Reservas» se decide AQUÍ, antes del LIMIT. Ordenar en memoria después
      // de recortar dejaba fuera a un archivo antiguo con el plazo vencido, justo el más urgente.
      // El plazo vigente es el de `plazoVigente` del dominio: `time_limit` si CONFIRMADA y
      // `pago_total_vence_en` si ABONADA_AL_PROVEEDOR; el más próximo de las reservas (las
      // CAIDA/CANCELADA no aportan nada). Solo cuenta en un archivo ABIERTO. A igual plazo, número
      // ascendente; sin plazo, al final y por número DESCENDENTE (T-257): los recién abiertos nacen
      // sin plazo, y con número ascendente quedaban fuera del límite en cuanto los archivos sin
      // plazo lo superaban. Igual que `compararPorPlazo`.
      const porEstado =
        filtro.estado === 'TODOS'
          ? Prisma.empty
          : Prisma.sql`AND t.estado = ${filtro.estado}::estado_archivo_de_viaje`;
      const ordenados = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT t.id
          FROM travel_files t
          LEFT JOIN (
            SELECT b.travel_file_id,
                   MIN(CASE b.estado
                         WHEN 'CONFIRMADA' THEN b.time_limit
                         WHEN 'ABONADA_AL_PROVEEDOR' THEN b.pago_total_vence_en
                       END) AS proximo_plazo
              FROM bookings b
             WHERE b.tenant_id = ${tenantId}::uuid
             GROUP BY b.travel_file_id
          ) p ON p.travel_file_id = t.id
         WHERE t.tenant_id = ${tenantId}::uuid ${porEstado}
         ORDER BY (CASE WHEN t.estado = 'ABIERTO' THEN p.proximo_plazo END) ASC NULLS LAST,
                  (CASE WHEN t.estado = 'ABIERTO' AND p.proximo_plazo IS NOT NULL
                        THEN t.numero END) ASC,
                  t.numero DESC
         LIMIT ${filtro.limite}`;
      const ids = ordenados.map((o) => o.id);
      if (ids.length === 0) return [];
      const filas = await tx.travelFile.findMany({
        where: { tenantId, id: { in: ids } },
        include: CON_RESERVAS,
      });
      const posicion = new Map(ids.map((id, i) => [id, i]));
      return filas
        .sort((a, b) => (posicion.get(a.id) ?? 0) - (posicion.get(b.id) ?? 0))
        .map(aArchivo);
    });
  }

  leer(archivoId: string): Promise<Archivo | null> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      const f = await tx.travelFile.findFirst({
        where: { id: archivoId, tenantId },
        include: CON_TODO,
      });
      return f ? aArchivo(f) : null;
    });
  }

  historialDe(archivoId: string): Promise<CambioDeEstadoDeReserva[]> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant((tx) => leerHistorialDelArchivo(tx, tenantId, archivoId));
  }

  enTransaccion<T>(fn: (ops: OperacionesDelArchivo) => Promise<T>): Promise<T> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant((tx) => fn(new OperacionesPrisma(tx, tenantId)));
  }
}
