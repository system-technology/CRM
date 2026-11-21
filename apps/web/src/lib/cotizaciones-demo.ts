/**
 * Versión de cotización SIMULADA del modo demostración.
 *
 * Antes el guardado simulado fijaba un precio unitario (2.450.000, niño al 70 %) sin mirar el
 * paquete: el cotizador mostraba 10.800.000 y la versión guardada 8.330.000, una demo que mentía.
 * Ahora se usa el MISMO cálculo que el cotizador (`calcularCotizacionMock`), con los mismos
 * enteros en la unidad mínima (R8: en COP es el peso) y la moneda ISO-4217. Solo aplica con la API
 * real apagada: con la real, el servidor es quien cotiza.
 */

import type { Acomodacion, OpcionDePrecio, VersionDeCotizacion } from '@viajapro/contracts';
import { calcularCotizacionMock } from './cotizador-logica';
import type { PaqueteConDetalle } from './mock-catalogo';

export interface ComposicionSimulada {
  fecha: string;
  adultos: number;
  ninos: number;
  infantes: number;
  acomodacion?: Acomodacion | null | undefined;
  vigenteHasta?: string | null | undefined;
}

const NOMBRE_DE_LINEA = {
  ADT: 'Adulto',
  CHD: 'Niño (2-11 años)',
  INF: 'Infante (menor de 2 años)',
} as const;

/** UUID estable por tipo de pasajero: la versión simulada no tiene tarifas reales detrás. */
const TARIFA_ID = {
  ADT: '01932000-0000-7000-8000-000000000011',
  CHD: '01932000-0000-7000-8000-000000000012',
  INF: '01932000-0000-7000-8000-000000000013',
} as const;

export function construirVersionSimulada(entrada: {
  id: string;
  numero: number;
  creadaEn: string;
  paquete: PaqueteConDetalle;
  composicion: ComposicionSimulada;
}): VersionDeCotizacion {
  const { paquete, composicion: c } = entrada;
  // Lo mismo que el cotizador de demostración: sin markup extra y con la acomodación elegida.
  const calculo = calcularCotizacionMock(
    {
      paqueteId: paquete.id,
      fechaSalida: c.fecha,
      pasajeros: { adultos: c.adultos, ninos: c.ninos, infantes: c.infantes },
      acomodacion: c.acomodacion ?? undefined,
      markupExtra: 0,
    },
    paquete,
  );
  const vigencia =
    paquete.vigencias.find((v) => c.fecha >= v.desde && c.fecha <= v.hasta) ?? paquete.vigencias[0];
  if (!vigencia) throw new Error('El simulador necesita al menos una vigencia con tarifas');

  const lineas: OpcionDePrecio[] = calculo.lineas.map((l) => ({
    tarifaId: TARIFA_ID[l.tipoPasajero],
    nombre:
      l.tipoPasajero === 'ADT'
        ? `${NOMBRE_DE_LINEA.ADT} en acomodación ${calculo.acomodacion}`
        : NOMBRE_DE_LINEA[l.tipoPasajero],
    unidad: 'POR_PERSONA',
    cubrePasajeros: 1,
    veces: l.cantidad,
    precioUnitario: l.precioUnitarioVenta,
    total: l.subtotalVenta,
    masBarata: false,
  }));

  return {
    id: entrada.id,
    numero: entrada.numero,
    creadaEn: entrada.creadaEn,
    paqueteId: paquete.id,
    paqueteNombre: paquete.nombre,
    destino: paquete.destino,
    noches: paquete.noches,
    fechaSalida: c.fecha,
    vigenciaId: vigencia.id,
    vigenciaDesde: vigencia.desde,
    vigenciaHasta: vigencia.hasta,
    deSalidaProgramada: true,
    adultos: c.adultos,
    ninos: c.ninos,
    infantes: c.infantes,
    acomodacion: calculo.acomodacion,
    politica: {
      porcentaje: 15,
      base: 'SOBRE_EL_NETO',
      origenDeLaVenta: 'DERIVADA_DEL_NETO',
      redondeoVenta: 1000,
    },
    lineas,
    venta: calculo.totalVenta,
    vigenteHasta: c.vigenteHasta ?? null,
  };
}
