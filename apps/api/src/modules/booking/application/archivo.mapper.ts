/**
 * Del dominio al contrato. Aquí —y solo aquí— se decide si el neto sale (T-248): `verNeto` es un
 * parámetro OBLIGATORIO y sin valor por defecto, para que olvidarlo no compile. Sin él, la clave
 * `netoUnidades` no aparece en la respuesta: ni siquiera como `null`.
 */
import type { DetalleDeArchivo, ReservaDelArchivo, ResumenDeArchivo } from '@viajapro/contracts';
import { monedaDeLaBase } from './moneda.js';
import {
  type Archivo,
  avanceDelArchivo,
  pasajerosNoCuadran,
  plazosDelArchivo,
  plazoVigente,
  semaforoDe,
} from '../domain/archivo.js';
import type { CambioDeEstadoDeReserva, Reserva } from '../domain/reserva.js';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function aReserva(r: Reserva, ahora: Date, verNeto: boolean): ReservaDelArchivo {
  const plazo = plazoVigente(r);
  return {
    id: r.id,
    mayoristaId: r.mayoristaId,
    mayoristaNombre: r.mayoristaNombre,
    moneda: monedaDeLaBase(r.monedaIso),
    // La clave entera se omite sin permiso: un `null` diría «neto desconocido», que es otra cosa.
    ...(verNeto
      ? { netoUnidades: r.netoUnidades === null ? null : r.netoUnidades.toString() }
      : {}),
    localizador: r.localizador,
    estado: r.estado,
    solicitadaEn: iso(r.solicitadaEn),
    confirmadaEn: iso(r.confirmadaEn),
    abonadaEn: iso(r.abonadaEn),
    pagadaEn: iso(r.pagadaEn),
    timeLimit: iso(r.timeLimit),
    pagoTotalVenceEn: iso(r.pagoTotalVenceEn),
    motivoCaida: r.motivoCaida,
    nota: r.nota,
    plazoVigente: iso(plazo),
    semaforo: semaforoDe(plazo, ahora),
  };
}

export function aResumen(a: Archivo, ahora: Date, verNeto: boolean): ResumenDeArchivo {
  const { proximoPlazo, semaforo } = plazosDelArchivo(a.reservas, ahora);
  return {
    id: a.id,
    numero: a.numero,
    contactoId: a.contactoId,
    oportunidadId: a.oportunidadId,
    cotizacionId: a.cotizacionId,
    versionCotizacion: a.versionCotizacion,
    paqueteNombre: a.paqueteNombre,
    destino: a.destino,
    fechaSalida: a.fechaSalida,
    noches: a.noches,
    adultos: a.adultos,
    ninos: a.ninos,
    infantes: a.infantes,
    venta: { unidades: a.ventaUnidades.toString(), moneda: monedaDeLaBase(a.monedaIso) },
    trm: a.trm,
    estado: a.estado,
    avance: avanceDelArchivo(a),
    motivoCancelacion: a.motivoCancelacion,
    notaCancelacion: a.notaCancelacion,
    canceladoEn: iso(a.canceladoEn),
    proximoPlazo: iso(a.estado === 'ABIERTO' ? proximoPlazo : null),
    semaforo: a.estado === 'ABIERTO' ? semaforo : null,
    reservas: a.reservas.map((r) => aReserva(r, ahora, verNeto)),
    creadoEn: a.creadoEn.toISOString(),
  };
}

export function aDetalle(
  a: Archivo,
  ahora: Date,
  verNeto: boolean,
  historial: readonly CambioDeEstadoDeReserva[],
): DetalleDeArchivo {
  return {
    ...aResumen(a, ahora, verNeto),
    pasajeros: a.pasajeros.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      edadAlViaje: p.edadAlViaje,
      esTitular: p.esTitular,
      orden: p.orden,
    })),
    avisos: pasajerosNoCuadran(a, a.pasajeros) ? ['PASAJEROS_NO_CUADRAN_CON_LA_VENTA'] : [],
    historial: historial.map((h) => ({
      id: h.id,
      reservaId: h.reservaId,
      estadoAnterior: h.estadoAnterior,
      estadoNuevo: h.estadoNuevo,
      usuarioId: h.usuarioId,
      ocurridoEn: h.ocurridoEn.toISOString(),
    })),
  };
}
