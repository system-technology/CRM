/**
 * Lógica pura de comparación (diff) entre dos versiones inmutables de una cotización (T-128).
 *
 * Reglas de negocio y seguridad:
 * - R8: Dinero en enteros de la unidad mínima (COP es peso sin decimales) + ISO 4217.
 * - R9: Fechas en formato ISO / America/Bogota.
 * - Seguridad (ADR-0011): `neto` y `margen` NUNCA se exponen si el usuario no tiene el permiso
 *   `cotizacion.ver_neto_y_margen`. Se omiten estrictamente (undefined) a nivel de totales y de líneas.
 * - Resalta diferencias por línea: pasajeros, salida, cargos, descuentos, totales y su efecto neto.
 */

import type { VersionDeCotizacion, Dinero } from '@viajapro/contracts';

export type TipoCambioLinea = 'SIN_CAMBIO' | 'MODIFICADA' | 'AGREGADA' | 'ELIMINADA';
export type EfectoMonetario = 'AUMENTO' | 'DISMINUCION' | 'NEUTRO';

export interface CambioSimple<T> {
  anterior: T;
  nuevo: T;
  haCambiado: boolean;
}

export interface DiffLineaPrecio {
  tarifaId: string;
  nombre: string;
  tipo: TipoCambioLinea;

  // Versión A
  vecesA?: number | undefined;
  precioUnitarioA?: Dinero | undefined;
  totalA?: Dinero | undefined;
  margenA?: Dinero | null | undefined;

  // Versión B
  vecesB?: number | undefined;
  precioUnitarioB?: Dinero | undefined;
  totalB?: Dinero | undefined;
  margenB?: Dinero | null | undefined;

  // Diferencia
  deltaTotal: Dinero;
  deltaMargen?: Dinero | null | undefined;
  efecto: EfectoMonetario;
}

export interface DiffTotales {
  ventaA: Dinero;
  ventaB: Dinero;
  deltaVenta: Dinero;
  efectoVenta: EfectoMonetario;
  porcentajeVariacionVenta: number;

  // Solo si puedeVerNetoYMargen === true
  netoA?: Dinero | null | undefined;
  netoB?: Dinero | null | undefined;
  deltaNeto?: Dinero | null | undefined;
  margenA?: Dinero | null | undefined;
  margenB?: Dinero | null | undefined;
  deltaMargen?: Dinero | null | undefined;
}

export interface ComparacionVersionesCotizacion {
  versionA: {
    id: string;
    numero: number;
    creadaEn: string;
  };
  versionB: {
    id: string;
    numero: number;
    creadaEn: string;
  };
  paqueteNombre: string;

  // Comparación de parámetros de viaje
  parametros: {
    adultos: CambioSimple<number>;
    ninos: CambioSimple<number>;
    infantes: CambioSimple<number>;
    totalPasajeros: CambioSimple<number>;
    fechaSalida: CambioSimple<string>;
    noches: CambioSimple<number>;
    acomodacion: CambioSimple<string | null>;
    vigenteHasta: CambioSimple<string | null>;
    opcionDeSalidaId: CambioSimple<string | null | undefined>;
  };

  // Comparación línea por línea
  lineas: DiffLineaPrecio[];

  // Totales consolidados
  totales: DiffTotales;

  // Resumen textual y viñetas
  resumenCambios: string[];
  resumenEfectoTotal: string;
}

/**
 * Resta dos importes de Dinero usando enteros de BigInt (R8).
 * Retorna `B - A`.
 */
export function restarDinero(dineroB: Dinero, dineroA: Dinero): Dinero {
  const moneda = dineroB.moneda || dineroA.moneda || 'COP';
  const uA = BigInt(dineroA.unidades || '0');
  const uB = BigInt(dineroB.unidades || '0');
  const delta = uB - uA;

  return {
    unidades: delta.toString(),
    moneda,
  };
}

/**
 * Determina si el valor monetario representa un aumento, disminución o sin cambio.
 */
export function determinarEfectoMonetario(delta: Dinero): EfectoMonetario {
  const val = BigInt(delta.unidades || '0');
  if (val > 0n) return 'AUMENTO';
  if (val < 0n) return 'DISMINUCION';
  return 'NEUTRO';
}

/**
 * Formatea una diferencia de dinero con signo explícito y código de moneda ISO.
 * Ej: "+ $ 250.000 COP", "- $ 120.000 COP", "$ 0 COP"
 */
export function formatearDeltaDinero(delta: Dinero): string {
  const val = BigInt(delta.unidades || '0');
  const esNegativo = val < 0n;
  const absVal = esNegativo ? -val : val;

  const formateador = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: delta.moneda === 'COP' ? 0 : 2,
    minimumFractionDigits: delta.moneda === 'COP' ? 0 : 2,
  });

  const numeroFormateado = formateador.format(Number(absVal));
  const signo = esNegativo ? '-' : val > 0n ? '+' : '';

  if (signo) {
    return `${signo} $ ${numeroFormateado} ${delta.moneda}`;
  }
  return `$ ${numeroFormateado} ${delta.moneda}`;
}

/**
 * Compara dos versiones de una cotización y genera el informe detallado de diferencias.
 */
export function compararVersionesCotizacion(
  versionA: VersionDeCotizacion,
  versionB: VersionDeCotizacion,
  puedeVerNetoYMargen = false,
): ComparacionVersionesCotizacion {
  // 1. Comparar parámetros de composición
  const totalPasajerosA = versionA.adultos + versionA.ninos + versionA.infantes;
  const totalPasajerosB = versionB.adultos + versionB.ninos + versionB.infantes;

  const parametros = {
    adultos: {
      anterior: versionA.adultos,
      nuevo: versionB.adultos,
      haCambiado: versionA.adultos !== versionB.adultos,
    },
    ninos: {
      anterior: versionA.ninos,
      nuevo: versionB.ninos,
      haCambiado: versionA.ninos !== versionB.ninos,
    },
    infantes: {
      anterior: versionA.infantes,
      nuevo: versionB.infantes,
      haCambiado: versionA.infantes !== versionB.infantes,
    },
    totalPasajeros: {
      anterior: totalPasajerosA,
      nuevo: totalPasajerosB,
      haCambiado: totalPasajerosA !== totalPasajerosB,
    },
    fechaSalida: {
      anterior: versionA.fechaSalida,
      nuevo: versionB.fechaSalida,
      haCambiado: versionA.fechaSalida !== versionB.fechaSalida,
    },
    noches: {
      anterior: versionA.noches,
      nuevo: versionB.noches,
      haCambiado: versionA.noches !== versionB.noches,
    },
    acomodacion: {
      anterior: versionA.acomodacion ?? null,
      nuevo: versionB.acomodacion ?? null,
      haCambiado: versionA.acomodacion !== versionB.acomodacion,
    },
    vigenteHasta: {
      anterior: versionA.vigenteHasta ?? null,
      nuevo: versionB.vigenteHasta ?? null,
      haCambiado: versionA.vigenteHasta !== versionB.vigenteHasta,
    },
    opcionDeSalidaId: {
      anterior: versionA.opcionDeSalidaId,
      nuevo: versionB.opcionDeSalidaId,
      haCambiado: versionA.opcionDeSalidaId !== versionB.opcionDeSalidaId,
    },
  };

  // 2. Comparar líneas de precio
  const mapaLineasA = new Map(versionA.lineas.map((l) => [l.tarifaId, l]));
  const mapaLineasB = new Map(versionB.lineas.map((l) => [l.tarifaId, l]));
  const todasLasTarifasIds = Array.from(
    new Set([...Array.from(mapaLineasA.keys()), ...Array.from(mapaLineasB.keys())]),
  );

  const diffLineas: DiffLineaPrecio[] = todasLasTarifasIds.map((tarifaId) => {
    const lA = mapaLineasA.get(tarifaId);
    const lB = mapaLineasB.get(tarifaId);

    const ceroDinero: Dinero = {
      unidades: '0',
      moneda: lB?.total.moneda || lA?.total.moneda || 'COP',
    };

    if (lA && lB) {
      // Línea en ambas versiones
      const deltaTotal = restarDinero(lB.total, lA.total);
      const efecto = determinarEfectoMonetario(deltaTotal);
      const haCambiado =
        lA.veces !== lB.veces ||
        lA.precioUnitario.unidades !== lB.precioUnitario.unidades ||
        lA.total.unidades !== lB.total.unidades;

      let deltaMargen: Dinero | null | undefined = undefined;

      if (puedeVerNetoYMargen) {
        if (lA.margen && lB.margen) {
          deltaMargen = restarDinero(lB.margen, lA.margen);
        } else {
          deltaMargen = null;
        }
      }

      return {
        tarifaId,
        nombre: lB.nombre || lA.nombre,
        tipo: haCambiado ? 'MODIFICADA' : 'SIN_CAMBIO',
        vecesA: lA.veces,
        precioUnitarioA: lA.precioUnitario,
        totalA: lA.total,
        margenA: puedeVerNetoYMargen ? lA.margen : undefined,
        vecesB: lB.veces,
        precioUnitarioB: lB.precioUnitario,
        totalB: lB.total,
        margenB: puedeVerNetoYMargen ? lB.margen : undefined,
        deltaTotal,
        deltaMargen,
        efecto,
      };
    } else if (lB && !lA) {
      // Línea agregada en B
      const deltaTotal = lB.total;
      return {
        tarifaId,
        nombre: lB.nombre,
        tipo: 'AGREGADA',
        vecesB: lB.veces,
        precioUnitarioB: lB.precioUnitario,
        totalB: lB.total,
        margenB: puedeVerNetoYMargen ? lB.margen : undefined,
        deltaTotal,
        deltaMargen: puedeVerNetoYMargen ? lB.margen : undefined,
        efecto: 'AUMENTO',
      };
    } else {
      // Línea eliminada de A (lA existe, !lB)
      const l = lA!;
      const deltaTotal = restarDinero(ceroDinero, l.total);
      let deltaMargen: Dinero | null | undefined = undefined;

      if (puedeVerNetoYMargen) {
        deltaMargen = l.margen ? restarDinero(ceroDinero, l.margen) : null;
      }

      return {
        tarifaId,
        nombre: l.nombre,
        tipo: 'ELIMINADA',
        vecesA: l.veces,
        precioUnitarioA: l.precioUnitario,
        totalA: l.total,
        margenA: puedeVerNetoYMargen ? l.margen : undefined,
        deltaTotal,
        deltaMargen,
        efecto: 'DISMINUCION',
      };
    }
  });

  // 3. Comparar totales consolidados
  const deltaVenta = restarDinero(versionB.venta, versionA.venta);
  const efectoVenta = determinarEfectoMonetario(deltaVenta);

  const uVentaA = BigInt(versionA.venta.unidades || '0');
  const uDeltaVenta = BigInt(deltaVenta.unidades || '0');
  let porcentajeVariacionVenta = 0;
  if (uVentaA !== 0n) {
    porcentajeVariacionVenta = Number((uDeltaVenta * 10000n) / uVentaA) / 100;
  }

  const totales: DiffTotales = {
    ventaA: versionA.venta,
    ventaB: versionB.venta,
    deltaVenta,
    efectoVenta,
    porcentajeVariacionVenta,
  };

  if (puedeVerNetoYMargen) {
    totales.netoA = versionA.neto;
    totales.netoB = versionB.neto;
    if (versionA.neto && versionB.neto) {
      totales.deltaNeto = restarDinero(versionB.neto, versionA.neto);
    } else {
      totales.deltaNeto = null;
    }

    totales.margenA = versionA.margen;
    totales.margenB = versionB.margen;
    if (versionA.margen && versionB.margen) {
      totales.deltaMargen = restarDinero(versionB.margen, versionA.margen);
    } else {
      totales.deltaMargen = null;
    }
  }

  // 4. Armar resumen textual de cambios
  const resumenCambios: string[] = [];

  if (parametros.adultos.haCambiado) {
    const diff = parametros.adultos.nuevo - parametros.adultos.anterior;
    resumenCambios.push(
      `Adultos: ${parametros.adultos.anterior} → ${parametros.adultos.nuevo} (${diff > 0 ? `+${diff}` : diff})`,
    );
  }
  if (parametros.ninos.haCambiado) {
    const diff = parametros.ninos.nuevo - parametros.ninos.anterior;
    resumenCambios.push(
      `Niños: ${parametros.ninos.anterior} → ${parametros.ninos.nuevo} (${diff > 0 ? `+${diff}` : diff})`,
    );
  }
  if (parametros.infantes.haCambiado) {
    const diff = parametros.infantes.nuevo - parametros.infantes.anterior;
    resumenCambios.push(
      `Infantes: ${parametros.infantes.anterior} → ${parametros.infantes.nuevo} (${diff > 0 ? `+${diff}` : diff})`,
    );
  }
  if (parametros.fechaSalida.haCambiado) {
    resumenCambios.push(
      `Fecha de salida: ${parametros.fechaSalida.anterior} → ${parametros.fechaSalida.nuevo}`,
    );
  }
  if (parametros.noches.haCambiado) {
    resumenCambios.push(`Noches: ${parametros.noches.anterior} → ${parametros.noches.nuevo}`);
  }
  if (parametros.acomodacion.haCambiado) {
    resumenCambios.push(
      `Acomodación: ${parametros.acomodacion.anterior ?? 'Sin especificar'} → ${parametros.acomodacion.nuevo ?? 'Sin especificar'}`,
    );
  }
  if (parametros.vigenteHasta.haCambiado) {
    resumenCambios.push(
      `Vigencia de oferta: ${parametros.vigenteHasta.anterior ?? 'Indefinida'} → ${parametros.vigenteHasta.nuevo ?? 'Indefinida'}`,
    );
  }

  // Líneas agregadas y eliminadas en el resumen
  const agregadas = diffLineas.filter((l) => l.tipo === 'AGREGADA');
  const eliminadas = diffLineas.filter((l) => l.tipo === 'ELIMINADA');
  const modificadas = diffLineas.filter((l) => l.tipo === 'MODIFICADA');

  for (const l of agregadas) {
    resumenCambios.push(`Añadida línea: «${l.nombre}» (${formatearDeltaDinero(l.deltaTotal)})`);
  }
  for (const l of eliminadas) {
    resumenCambios.push(`Removida línea: «${l.nombre}» (${formatearDeltaDinero(l.deltaTotal)})`);
  }
  for (const l of modificadas) {
    resumenCambios.push(`Ajustada línea: «${l.nombre}» (${formatearDeltaDinero(l.deltaTotal)})`);
  }

  // Resumen del efecto total
  const strDelta = formatearDeltaDinero(deltaVenta);
  const strPct = Math.abs(porcentajeVariacionVenta).toFixed(1);
  let resumenEfectoTotal: string;

  if (efectoVenta === 'AUMENTO') {
    resumenEfectoTotal = `El total aumentó en ${strDelta} (+${strPct} %) respecto a la Versión ${versionA.numero}.`;
  } else if (efectoVenta === 'DISMINUCION') {
    resumenEfectoTotal = `El total disminuyó en ${strDelta} (-${strPct} %) respecto a la Versión ${versionA.numero}.`;
  } else {
    resumenEfectoTotal = `El total se mantiene idéntico (${strDelta}) entre ambas versiones.`;
  }

  return {
    versionA: {
      id: versionA.id,
      numero: versionA.numero,
      creadaEn: versionA.creadaEn,
    },
    versionB: {
      id: versionB.id,
      numero: versionB.numero,
      creadaEn: versionB.creadaEn,
    },
    paqueteNombre: versionB.paqueteNombre || versionA.paqueteNombre,
    parametros,
    lineas: diffLineas,
    totales,
    resumenCambios,
    resumenEfectoTotal,
  };
}
