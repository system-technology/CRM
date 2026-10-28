import type {
  Acomodacion,
  Dinero,
  PlanAlimentacion,
  Precio,
  Temporada,
  TipoPasajero,
  SalidaPublicada,
  CargoEnDestino,
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

/**
 * Entrega el texto de presentación y advertencia honesta para la tarifa «desde» (0c.17).
 * Si la tarifa es de grupo, no puede enseñarse como compra individual a secas.
 */
export function formatearCondicionDesde(salida: Pick<SalidaPublicada, 'desdeEsDeGrupo'>): {
  subtitulo: string;
  esGrupo: boolean;
  aviso?: string;
} {
  if (salida.desdeEsDeGrupo) {
    return {
      subtitulo: 'por persona · en promo grupal',
      esGrupo: true,
      aviso: 'Tarifa condicionada: Precio per cápita sujeto a compra en grupo o pareja.',
    };
  }
  return {
    subtitulo: 'por persona (COP)',
    esGrupo: false,
  };
}

/**
 * Formatea el horario de salida y regreso de una excursión de forma legible.
 */
export function formatearHorarioExcursion(
  horaSalida?: string | null,
  horaRegreso?: string | null,
): string | null {
  if (horaSalida && horaRegreso) {
    return `Salida: ${horaSalida} · Regreso: ${horaRegreso}`;
  }
  if (horaSalida) {
    return `Salida: ${horaSalida}`;
  }
  if (horaRegreso) {
    return `Regreso: ${horaRegreso}`;
  }
  return null;
}

export type EstadoCupos = 'DISPONIBLE' | 'ULTIMOS_CUPOS' | 'AGOTADO' | 'PROGRAMADA';

export interface InfoDisponibilidadCupos {
  estado: EstadoCupos;
  etiqueta: string;
  claseColor: string;
}

/**
 * Clasifica la disponibilidad de cupos de una salida para mostrar chips de urgencia o estado.
 */
export function clasificarDisponibilidadCupos(cupos: number | null): InfoDisponibilidadCupos {
  if (cupos === null) {
    return {
      estado: 'PROGRAMADA',
      etiqueta: 'Salida programada',
      claseColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
    };
  }
  if (cupos <= 0) {
    return {
      estado: 'AGOTADO',
      etiqueta: 'Agotado',
      claseColor: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    };
  }
  if (cupos <= 5) {
    return {
      estado: 'ULTIMOS_CUPOS',
      etiqueta: `Últimos ${cupos} cupos`,
      claseColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    };
  }
  return {
    estado: 'DISPONIBLE',
    etiqueta: `${cupos} cupos disponibles`,
    claseColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  };
}

/**
 * Formatea la presentación de tarifas según la política promo_vencida calculada por la API (T-051).
 * La web NUNCA compara fechas ni decide si la promo venció: respeta estrictamente lo que entrega la API.
 */
export function interpretarPresentacionTarifa(presentacion?: {
  estado: 'CONSULTAR' | 'VIGENTE' | 'PROMO_VIGENTE' | 'PROMO_VENCIDA';
  venta: Dinero | null;
  listaTachada: Dinero | null;
  leyenda: 'PROMO_VENCIDA' | null;
  promoVigente: boolean;
}): {
  mostrarTachado: boolean;
  listaTachada: Dinero | null;
  mostrarLeyendaVencida: boolean;
  promoVigente: boolean;
  esConsultar: boolean;
} {
  if (!presentacion) {
    return {
      mostrarTachado: false,
      listaTachada: null,
      mostrarLeyendaVencida: false,
      promoVigente: false,
      esConsultar: false,
    };
  }

  const esConsultar = presentacion.estado === 'CONSULTAR' || presentacion.venta === null;
  const mostrarTachado = Boolean(presentacion.listaTachada);
  const mostrarLeyendaVencida = presentacion.leyenda === 'PROMO_VENCIDA';

  return {
    mostrarTachado,
    listaTachada: presentacion.listaTachada,
    mostrarLeyendaVencida,
    promoVigente: presentacion.promoVigente,
    esConsultar,
  };
}

/**
 * Verifica y asegura que los cargos en destino se mantengan separados del precio del paquete/cotización
 * y nunca se sumen al total a cobrar por la agencia (R8, ADR-0017 §9).
 */
export function verificarCargosEnDestinoSeparados(
  totalVenta: Dinero,
  cargosEnDestino: CargoEnDestino[] = [],
): {
  totalAgencia: Dinero;
  cargosEnDestino: CargoEnDestino[];
  sumaCargosEnDestino: Dinero | null;
  totalNuncaIncluyeCargos: boolean;
} {
  let totalCargosCentavos = 0n;
  let mismaMoneda = true;

  for (const cargo of cargosEnDestino) {
    if (cargo.monto) {
      if (cargo.monto.moneda === totalVenta.moneda) {
        totalCargosCentavos += BigInt(cargo.monto.unidades);
      } else {
        mismaMoneda = false;
      }
    }
  }

  const sumaCargosEnDestino: Dinero | null =
    cargosEnDestino.length > 0 && mismaMoneda
      ? { unidades: totalCargosCentavos.toString(), moneda: totalVenta.moneda }
      : null;

  return {
    totalAgencia: totalVenta,
    cargosEnDestino,
    sumaCargosEnDestino,
    totalNuncaIncluyeCargos: true,
  };
}

export type TipoProductoTurismo =
  | 'isla_beach_club'
  | 'reserva_natural'
  | 'city_tour'
  | 'aventura_nautica'
  | 'paquete_hotel'
  | 'excursion_general';

/**
 * Infiere el tipo de excursión a partir del título, descripción o etiquetas (T-036).
 * Asigna identidades de color, icono y degradado en base a vocabulario turístico.
 */
export function inferirTipoProducto(nombre: string, etiquetas?: string[]): TipoProductoTurismo {
  const texto = `${nombre} ${(etiquetas ?? []).join(' ')}`.toLowerCase();

  // 1. Ecoturismo y reservas naturales (alta prioridad semántica)
  if (
    texto.includes('reserva') ||
    texto.includes('parque natural') ||
    texto.includes('manglar') ||
    texto.includes('manglares') ||
    texto.includes('selva') ||
    texto.includes('fauna') ||
    texto.includes('flora') ||
    texto.includes('ecotur') ||
    /\beco\b/.test(texto) ||
    texto.includes('senderismo') ||
    texto.includes('avistamiento') ||
    texto.includes('cascada') ||
    texto.includes('cueva')
  ) {
    return 'reserva_natural';
  }

  // 2. Playas, islas y clubes de playa
  if (
    texto.includes('isla') ||
    texto.includes('islas') ||
    texto.includes('playa') ||
    texto.includes('beach') ||
    texto.includes('cholon') ||
    texto.includes('cholón') ||
    texto.includes('rosario') ||
    texto.includes('baru') ||
    texto.includes('barú') ||
    texto.includes('cayo') ||
    texto.includes('palmar') ||
    texto.includes('beach club')
  ) {
    return 'isla_beach_club';
  }

  // 3. Ciudades, cultura e historia
  if (
    texto.includes('city') ||
    texto.includes('historico') ||
    texto.includes('histórico') ||
    texto.includes('ciudad') ||
    texto.includes('cultural') ||
    texto.includes('chiva') ||
    texto.includes('castillo') ||
    texto.includes('museo') ||
    texto.includes('comuna') ||
    texto.includes('graffiti') ||
    texto.includes('monumento') ||
    texto.includes('recorrido')
  ) {
    return 'city_tour';
  }

  // 4. Náutica, buceo y deportes de agua
  if (
    texto.includes('lancha') ||
    texto.includes('bote') ||
    texto.includes('yate') ||
    texto.includes('nautic') ||
    texto.includes('náutic') ||
    texto.includes('buceo') ||
    texto.includes('snorkel') ||
    texto.includes('careteo') ||
    texto.includes('pesca') ||
    texto.includes('kayak') ||
    texto.includes('catamaran') ||
    texto.includes('catamarán') ||
    texto.includes('jetski') ||
    texto.includes('rafting')
  ) {
    return 'aventura_nautica';
  }

  // 5. Acomodación y hotel / resorts
  if (
    texto.includes('hotel') ||
    texto.includes('acomodacion') ||
    texto.includes('acomodación') ||
    texto.includes('noches') ||
    texto.includes('resort') ||
    texto.includes('hospedaje') ||
    texto.includes('alojamiento')
  ) {
    return 'paquete_hotel';
  }

  return 'excursion_general';
}
