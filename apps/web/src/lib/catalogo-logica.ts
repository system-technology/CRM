import type {
  Acomodacion,
  Dinero,
  PlanAlimentacion,
  Precio,
  Temporada,
  TipoPasajero,
  SalidaPublicada,
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
 * Filtra el catálogo de paquetes según los criterios provistos (modo demo).
 */
export function filtrarPaquetes(
  paquetes: PaqueteConDetalle[],
  filtro: FiltroCatalogo,
): PaqueteConDetalle[] {
  const busqueda = filtro.busqueda?.trim().toLowerCase() ?? '';
  const fechaRef = filtro.fechaReferencia ?? new Date().toISOString().slice(0, 10);

  return paquetes.filter((p) => {
    if (busqueda) {
      const matchNombre = p.nombre.toLowerCase().includes(busqueda);
      const matchDestino = p.destino.toLowerCase().includes(busqueda);
      const matchMayorista = p.mayorista?.nombre.toLowerCase().includes(busqueda) ?? false;
      const matchInclusiones = p.inclusiones.some((inc) => inc.toLowerCase().includes(busqueda));

      if (!matchNombre && !matchDestino && !matchMayorista && !matchInclusiones) {
        return false;
      }
    }

    if (filtro.planAlimentacion && filtro.planAlimentacion !== 'TODOS') {
      if (p.planAlimentacion !== filtro.planAlimentacion) {
        return false;
      }
    }

    if (filtro.destino && filtro.destino !== 'TODOS') {
      if (p.destino.toLowerCase() !== filtro.destino.toLowerCase()) {
        return false;
      }
    }

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

/**
 * Formatea el texto de noches de una salida de catálogo.
 * Si noches es 0, es un pasadía / tour de 1 día.
 */
export function formatearNochesLabel(noches: number): string {
  if (noches === 0) return 'Pasadía';
  if (noches === 1) return '1 noche';
  return `${noches} noches`;
}

/**
 * Extrae lista única de destinos de las salidas reales para el selector de filtros.
 */
export function extraerDestinosDeSalidas(salidas: SalidaPublicada[]): string[] {
  const destinos = new Set<string>();
  for (const s of salidas) {
    if (s.destino && s.destino.trim()) {
      destinos.add(s.destino.trim());
    }
  }
  return Array.from(destinos).sort();
}

export interface FiltroSalidasPublicadas {
  busqueda?: string;
  destino?: string;
}

/**
 * Filtra salidas publicadas por texto de búsqueda y destino.
 */
export function filtrarSalidasPublicadas(
  salidas: SalidaPublicada[],
  filtro: FiltroSalidasPublicadas,
): SalidaPublicada[] {
  const b = filtro.busqueda?.trim().toLowerCase() ?? '';
  const d = filtro.destino?.trim().toLowerCase() ?? '';

  return salidas.filter((s) => {
    if (d && d !== 'todos' && s.destino.toLowerCase() !== d) {
      return false;
    }
    if (b) {
      const matchNombre = s.paqueteNombre.toLowerCase().includes(b);
      const matchDestino = s.destino.toLowerCase().includes(b);
      if (!matchNombre && !matchDestino) {
        return false;
      }
    }
    return true;
  });
}
