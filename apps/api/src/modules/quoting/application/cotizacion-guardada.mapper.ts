/**
 * De las filas de la base al contrato `CotizacionGuardada`.
 *
 * **Es el único sitio que decide si el margen sale.** Se guarda siempre (es la prueba de lo que
 * ganaba la agencia el día que se cotizó) pero se lee solo si se pide: revela el neto del
 * mayorista. Las claves se OMITEN, no van en `null`, igual que en la cotización sin guardar.
 */
import type {
  CotizacionDeSalida,
  CotizacionGuardada,
  VersionDeCotizacion,
} from '@viajapro/contracts';
import type { Cotizacion, VersionCotizacion } from '@prisma/client';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';

const aFecha = (d: Date): string => d.toISOString().slice(0, 10);

function sinMargen(lineas: CotizacionDeSalida['lineas']): CotizacionDeSalida['lineas'] {
  return lineas.map((l) => {
    const { margen: _m, margenPorcentaje: _p, ...resto } = l;
    return resto;
  });
}

export function aVersionDeCotizacion(
  v: VersionCotizacion,
  incluirMargen: boolean,
): VersionDeCotizacion {
  const moneda = monedaDeLaBase(v.monedaIso);
  const lineas = v.lineas as unknown as CotizacionDeSalida['lineas'];
  const dinero = (u: bigint | null) => (u === null ? null : { unidades: u.toString(), moneda });

  return {
    id: v.id,
    numero: v.numero,
    creadaEn: v.creadoEn.toISOString(),
    paqueteId: v.paqueteId,
    paqueteNombre: v.paqueteNombre,
    destino: v.destino,
    noches: v.noches,
    fechaSalida: aFecha(v.fechaSalida),
    vigenciaId: v.vigenciaId,
    vigenciaDesde: aFecha(v.vigenciaDesde),
    vigenciaHasta: aFecha(v.vigenciaHasta),
    deSalidaProgramada: v.deSalidaProgramada,
    adultos: v.adultos,
    ninos: v.ninos,
    infantes: v.infantes,
    acomodacion: v.acomodacion,
    ...(incluirMargen
      ? {
          politica: {
            porcentaje: Number(v.politicaPorcentaje),
            base: v.politicaBase,
            origenDeLaVenta: v.politicaOrigen,
            redondeoVenta: v.politicaRedondeo,
          },
        }
      : {}),
    lineas: incluirMargen ? lineas : sinMargen(lineas),
    venta: { unidades: v.ventaUnidades.toString(), moneda },
    ...(incluirMargen ? { neto: dinero(v.netoUnidades), margen: dinero(v.margenUnidades) } : {}),
    vigenteHasta: v.vigenteHasta ? aFecha(v.vigenteHasta) : null,
  };
}

export function aCotizacionGuardada(
  c: Cotizacion & { versiones: VersionCotizacion[] },
  incluirMargen: boolean,
): CotizacionGuardada {
  return {
    id: c.id,
    contactoId: c.contactoId,
    oportunidadId: c.oportunidadId,
    titulo: c.titulo,
    estado: c.estado,
    versionEnviada: c.versionEnviada,
    enviadaEn: c.enviadaEn ? c.enviadaEn.toISOString() : null,
    creadaEn: c.creadoEn.toISOString(),
    actualizadaEn: c.actualizadoEn.toISOString(),
    versiones: [...c.versiones]
      .sort((a, b) => a.numero - b.numero)
      .map((v) => aVersionDeCotizacion(v, incluirMargen)),
  };
}
