import type {
  Acomodacion,
  Dinero,
  PlanAlimentacion,
  Precio,
  Temporada,
  TipoPasajero,
} from '@viajapro/contracts';
import type { PaqueteConDetalle } from './mock-catalogo';

export interface FiltroCatalogo {
  busqueda?: string;
  planAlimentacion?: PlanAlimentacion | 'TODOS';
  soloVigentes?: boolean;
  destino?: string;
  fechaReferencia?: string;
}

export interface VigenciaTarifario {
  estaVigente: boolean;
  temporadasVigentes: Temporada[];
  proximoVencimiento: string | null;
}

/**
 * Obtiene el precio de venta más económico ("Desde") para adultos en este paquete.
 */
export function obtenerPrecioDesde(paquete: PaqueteConDetalle): Dinero | null {
  let menorPrecio: Dinero | null = null;
  let menorValor = Infinity;

  for (const temporada of paquete.temporadas) {
    for (const precio of temporada.precios) {
      if (precio.tipoPasajero === 'ADT') {
        const val = Number(precio.venta.unidades);
        if (val < menorValor) {
          menorValor = val;
          menorPrecio = precio.venta;
        }
      }
    }
  }

  return menorPrecio;
}

/**
 * Verifica si las temporadas del paquete siguen vigentes según una fecha de referencia.
 * Por defecto usa la fecha actual UTC (o la fecha del sistema).
 */
export function verificarVigenciaTarifario(
  temporadas: Temporada[],
  fechaReferencia: string = new Date().toISOString().slice(0, 10),
): VigenciaTarifario {
  const temporadasVigentes = temporadas.filter((t) => t.hasta >= fechaReferencia);
  const estaVigente = temporadasVigentes.length > 0;

  let proximoVencimiento: string | null = null;
  if (estaVigente) {
    // La fecha de vencimiento más próxima de las vigentes
    const fechas = temporadasVigentes.map((t) => t.hasta).sort();
    proximoVencimiento = fechas[0] ?? null;
  }

  return {
    estaVigente,
    temporadasVigentes,
    proximoVencimiento,
  };
}

/**
 * Filtra el catálogo de paquetes según los criterios provistos.
 */
export function filtrarPaquetes(
  paquetes: PaqueteConDetalle[],
  filtro: FiltroCatalogo,
): PaqueteConDetalle[] {
  const busqueda = filtro.busqueda?.trim().toLowerCase() ?? '';
  const fechaRef = filtro.fechaReferencia ?? new Date().toISOString().slice(0, 10);

  return paquetes.filter((p) => {
    // 1. Filtro de búsqueda
    if (busqueda) {
      const matchNombre = p.nombre.toLowerCase().includes(busqueda);
      const matchDestino = p.destino.toLowerCase().includes(busqueda);
      const matchMayorista = p.mayorista?.nombre.toLowerCase().includes(busqueda) ?? false;
      const matchInclusiones = p.inclusiones.some((inc) => inc.toLowerCase().includes(busqueda));

      if (!matchNombre && !matchDestino && !matchMayorista && !matchInclusiones) {
        return false;
      }
    }

    // 2. Filtro de plan de alimentación
    if (filtro.planAlimentacion && filtro.planAlimentacion !== 'TODOS') {
      if (p.planAlimentacion !== filtro.planAlimentacion) {
        return false;
      }
    }

    // 3. Filtro de destino exacto
    if (filtro.destino && filtro.destino !== 'TODOS') {
      if (p.destino.toLowerCase() !== filtro.destino.toLowerCase()) {
        return false;
      }
    }

    // 4. Filtro solo vigentes
    if (filtro.soloVigentes) {
      const vigencia = verificarVigenciaTarifario(p.temporadas, fechaRef);
      if (!vigencia.estaVigente || !p.activo) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Agrupa la lista de precios de una temporada por acomodación y tipo de pasajero
 * para construir la matriz de tarifas en la UI de forma limpia y accesible.
 */
export function agruparPreciosPorAcomodacion(
  precios: Precio[],
): Record<Acomodacion, Partial<Record<TipoPasajero, Precio>>> {
  const matriz: Record<Acomodacion, Partial<Record<TipoPasajero, Precio>>> = {
    SENCILLA: {},
    DOBLE: {},
    TRIPLE: {},
    CUADRUPLE: {},
  };

  for (const p of precios) {
    matriz[p.acomodacion][p.tipoPasajero] = p;
  }

  return matriz;
}
