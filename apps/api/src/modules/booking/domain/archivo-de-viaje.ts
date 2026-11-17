/**
 * Apertura del archivo de viaje (`TravelFile`) a partir de lo vendido. Lógica pura: sin base de
 * datos, sin reloj y sin framework (ADR-0024 §3.1, §3.3, §3.4).
 *
 * Un archivo por cotización aceptada y UNA reserva (`Booking`) por mayorista distinto. Las líneas
 * que no traen mayorista caen juntas en una reserva «por definir»: el asesor la completa después.
 * Nombres según el lenguaje ubicuo: archivo de viaje = `TravelFile`, reserva = `Booking`.
 */

/** Una línea de lo vendido, con lo único que la apertura necesita de ella. */
export interface LineaVendida {
  mayoristaId: string | null;
  mayoristaNombre: string | null;
  /** R8: unidad mínima de la moneda. `null` = neto desconocido, que no es cero. */
  netoUnidades: bigint | null;
}

/** Lo vendido (la versión aceptada), copiado para abrir el archivo. */
export interface VentaAceptada {
  cotizacionId: string;
  version: number;
  contactoId: string;
  oportunidadId: string | null;
  paqueteNombre: string;
  destino: string;
  /** `AAAA-MM-DD`. */
  fechaSalida: string;
  noches: number;
  adultos: number;
  ninos: number;
  infantes: number;
  ventaUnidades: bigint;
  monedaIso: string;
  trm: {
    monedaOrigen: string;
    monedaDestino: string;
    valor: string;
    fecha: string;
    fuente: 'OFICIAL' | 'AGENCIA';
  } | null;
  lineas: readonly LineaVendida[];
}

/** Una reserva por abrir: siempre nace `PENDIENTE` (aún no se pidió el cupo). */
export interface ReservaPorAbrir {
  /** `null` = «por definir». */
  mayoristaId: string | null;
  /** Copia del nombre: sobrevive a que el mayorista se borre del catálogo. */
  mayoristaNombre: string | null;
  netoUnidades: bigint | null;
  monedaIso: string;
}

export interface ArchivoPorAbrir {
  venta: VentaAceptada;
  reservas: ReservaPorAbrir[];
}

/**
 * Agrupa las líneas por mayorista, en orden de primera aparición y con «por definir» al final. El
 * neto de una reserva es la suma de sus líneas; si alguna no lo trae, es desconocido (`null`), no
 * una suma parcial que afirmaría un neto que nadie midió.
 */
export function reservasPorMayorista(
  lineas: readonly LineaVendida[],
  monedaIso: string,
): ReservaPorAbrir[] {
  const grupos = new Map<string, { nombre: string | null; neto: bigint; completo: boolean }>();
  let sinMayorista: { neto: bigint; completo: boolean } | null = null;

  for (const linea of lineas) {
    if (linea.mayoristaId === null) {
      sinMayorista ??= { neto: 0n, completo: true };
      if (linea.netoUnidades === null) sinMayorista.completo = false;
      else sinMayorista.neto += linea.netoUnidades;
      continue;
    }
    const g = grupos.get(linea.mayoristaId) ?? {
      nombre: linea.mayoristaNombre,
      neto: 0n,
      completo: true,
    };
    g.nombre ??= linea.mayoristaNombre;
    if (linea.netoUnidades === null) g.completo = false;
    else g.neto += linea.netoUnidades;
    grupos.set(linea.mayoristaId, g);
  }

  const reservas: ReservaPorAbrir[] = [...grupos].map(([mayoristaId, g]) => ({
    mayoristaId,
    mayoristaNombre: g.nombre,
    netoUnidades: g.completo ? g.neto : null,
    monedaIso,
  }));

  // Sin líneas (no debería ocurrir: una versión siempre trae alguna) o con líneas sin mayorista:
  // la reserva «por definir». Un archivo sin ninguna reserva no sería operable.
  if (sinMayorista !== null || reservas.length === 0) {
    reservas.push({
      mayoristaId: null,
      mayoristaNombre: null,
      netoUnidades: sinMayorista?.completo ? sinMayorista.neto : null,
      monedaIso,
    });
  }
  return reservas;
}

/** Arma lo que se escribirá al abrir el archivo de una cotización aceptada. */
export function abrirArchivoDeViaje(venta: VentaAceptada): ArchivoPorAbrir {
  return { venta, reservas: reservasPorMayorista(venta.lineas, venta.monedaIso) };
}
