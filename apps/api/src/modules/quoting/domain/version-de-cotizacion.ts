/**
 * De un cálculo a la instantánea que se guarda. Lógica pura: sin base de datos ni reloj.
 *
 * Aquí se decide qué entra en la versión y se vuelven a comprobar, en el dominio, las mismas
 * invariantes que la base exige con un disparador (las líneas suman la venta, una sola moneda):
 * preferimos fallar con un error tipado que con un `check_violation` de PostgreSQL.
 */
import type { CotizacionDeSalida, PoliticaAplicada } from '@viajapro/contracts';
import { CotizacionIncoherenteError, CotizacionSinLineasError } from './errors.js';

export interface DatosDeVersion {
  paqueteId: string;
  paqueteNombre: string;
  destino: string;
  noches: number;
  fechaSalida: string;
  vigenciaId: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  deSalidaProgramada: boolean;
  adultos: number;
  ninos: number;
  infantes: number;
  acomodacion: 'SENCILLA' | 'DOBLE' | 'TRIPLE' | 'CUADRUPLE' | null;
  politica: PoliticaAplicada;
  /** Las líneas tal como las calculó el servidor, con su margen si se calculó. */
  lineas: CotizacionDeSalida['lineas'];
  ventaUnidades: bigint;
  /** `null` = desconocido (alguna línea sin neto cargado). Nunca cero. */
  netoUnidades: bigint | null;
  margenUnidades: bigint | null;
  monedaIso: string;
  vigenteHasta: string | null;
}

export function armarVersion(
  calculo: CotizacionDeSalida,
  politica: PoliticaAplicada,
  extra: { acomodacion?: DatosDeVersion['acomodacion']; vigenteHasta?: string },
): DatosDeVersion {
  if (calculo.lineas.length === 0) throw new CotizacionSinLineasError();

  const moneda = calculo.total.moneda;
  let venta = 0n;
  let margen: bigint | null = 0n;

  for (const linea of calculo.lineas) {
    if (linea.total.moneda !== moneda) {
      throw new CotizacionIncoherenteError(
        `la línea «${linea.nombre}» está en ${linea.total.moneda} y el total en ${moneda}`,
      );
    }
    venta += BigInt(linea.total.unidades);

    // El margen de una línea sin neto cargado es `null`, y si no se pidió ni viene la clave: el
    // de la cotización queda DESCONOCIDO y no se trata como cero, que afirmaría un margen nulo
    // que nadie midió.
    if (linea.margen === null || linea.margen === undefined) {
      margen = null;
    } else if (margen !== null) {
      if (linea.margen.moneda !== moneda) {
        throw new CotizacionIncoherenteError(`el margen de «${linea.nombre}» está en otra moneda`);
      }
      margen += BigInt(linea.margen.unidades);
    }
  }

  if (venta !== BigInt(calculo.total.unidades)) {
    throw new CotizacionIncoherenteError(
      `las líneas suman ${venta} y el total dice ${calculo.total.unidades}`,
    );
  }

  return {
    paqueteId: calculo.paqueteId,
    paqueteNombre: calculo.paqueteNombre,
    destino: calculo.destino,
    noches: calculo.noches,
    fechaSalida: calculo.fecha,
    vigenciaId: calculo.vigenciaId,
    vigenciaDesde: calculo.vigenciaDesde,
    vigenciaHasta: calculo.vigenciaHasta,
    deSalidaProgramada: calculo.deSalidaProgramada,
    adultos: calculo.adultos,
    ninos: calculo.ninos,
    infantes: calculo.infantes,
    acomodacion: extra.acomodacion ?? null,
    politica,
    lineas: calculo.lineas,
    ventaUnidades: venta,
    netoUnidades: margen === null ? null : venta - margen,
    margenUnidades: margen,
    monedaIso: moneda,
    vigenteHasta: extra.vigenteHasta ?? null,
  };
}
