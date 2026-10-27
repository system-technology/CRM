import type {
  Acomodacion,
  Dinero,
  PlanAlimentacion,
  Precio,
  Temporada,
  TipoPasajero,
  SalidaPublicada,
  PresentacionDePrecio,
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

// =============================================================================
// Funciones T-018: Tarjeta y ficha de excursión en el catálogo
// =============================================================================

export type EstadoCupo = 'DISPONIBLE' | 'ULTIMOS_CUPOS' | 'AGOTADO';
export type TipoTurismo = 'PLAYA_NAUTICO' | 'NATURALEZA' | 'AVENTURA' | 'CULTURAL_CIUDAD';

export interface SalidaChipInfo {
  vigenciaId: string;
  fecha: string;
  etiquetaFecha: string; // ej: "sáb 3 oct"
  cupoTotal: number | null;
  etiquetaCupo: string; // ej: "quedan 4", "12 cupos", "Agotado", "Cupos abiertos"
  estadoCupo: EstadoCupo;
  desde: Dinero;
  desdeEsDeGrupo: boolean;
  presentacion?: PresentacionDePrecio | undefined;
}

export interface ProductoCatalogoAgrupado {
  paqueteId: string;
  nombre: string;
  destino: string;
  noches: number;
  dias: number;
  tipoTurismo: TipoTurismo;
  horario: string;
  inclusiones: string[];
  exclusiones: string[];
  descripcion?: string | null;
  requiereImpuestoMuelle: boolean;
  precioDesde: Dinero | null;
  precioEtiqueta: string;
  tienePromo: boolean;
  desdeEsDeGrupo: boolean;
  presentacion?: PresentacionDePrecio | undefined;
  salidas: SalidaChipInfo[];
  imagen?: string | null;
  camposPersonalizados?: Record<string, unknown> | null;
}

/**
 * Calcula el estado de disponibilidad según la cantidad de cupos (T-018).
 * - null: Cupos abiertos (DISPONIBLE)
 * - 0: AGOTADO
 * - <= 5: ULTIMOS_CUPOS
 * - > 5: DISPONIBLE
 */
export function calcularEstadoCupo(cupoTotal: number | null): EstadoCupo {
  if (cupoTotal === null) return 'DISPONIBLE';
  if (cupoTotal <= 0) return 'AGOTADO';
  if (cupoTotal <= 5) return 'ULTIMOS_CUPOS';
  return 'DISPONIBLE';
}

/**
 * Formatea un chip interactivo de salida para Colombia (ej: "sáb 3 oct · quedan 4")
 */
export function formatearChipSalida(
  salida: Pick<SalidaPublicada, 'vigenciaId' | 'fecha' | 'cupoTotal' | 'desde'> & {
    desdeEsDeGrupo?: boolean | undefined;
    presentacion?: PresentacionDePrecio | undefined;
  },
): SalidaChipInfo {
  const fechaObj = new Date(salida.fecha + 'T12:00:00Z');
  const etiquetaFecha = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(fechaObj);

  const estadoCupo = calcularEstadoCupo(salida.cupoTotal);
  let etiquetaCupo = 'Cupos abiertos';

  if (salida.cupoTotal === 0) {
    etiquetaCupo = 'Agotado';
  } else if (salida.cupoTotal !== null) {
    if (salida.cupoTotal <= 5) {
      etiquetaCupo = `quedan ${salida.cupoTotal}`;
    } else {
      etiquetaCupo = `${salida.cupoTotal} cupos`;
    }
  }

  return {
    vigenciaId: salida.vigenciaId,
    fecha: salida.fecha,
    etiquetaFecha,
    cupoTotal: salida.cupoTotal,
    etiquetaCupo,
    estadoCupo,
    desde: salida.desde,
    desdeEsDeGrupo: salida.desdeEsDeGrupo ?? false,
    ...(salida.presentacion ? { presentacion: salida.presentacion } : {}),
  };
}

/**
 * Determina el texto de tarifa per cápita. Si no tiene precio o unidades === 0,
 * devuelve 'Consultar', nunca '$0' (Regla UX Turismo y T-018).
 */
export function obtenerEtiquetaPrecio(desde: Dinero | null | undefined): string {
  if (!desde || !desde.unidades || Number(desde.unidades) === 0) {
    return 'Consultar';
  }
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: desde.moneda,
    maximumFractionDigits: 0,
  }).format(Number(desde.unidades));
  return `Desde ${formatted} por persona`;
}

/**
 * Detecta el tipo de turismo para seleccionar la paleta de tokens y degradado de fondo.
 */
export function detectarTipoTurismo(destino: string, nombre: string): TipoTurismo {
  const t = `${destino} ${nombre}`.toLowerCase();
  if (
    t.includes('playa') ||
    t.includes('isla') ||
    t.includes('rosario') ||
    t.includes('barú') ||
    t.includes('baru') ||
    t.includes('cartagena') ||
    t.includes('san andrés') ||
    t.includes('san andres') ||
    t.includes('punta cana') ||
    t.includes('mar') ||
    t.includes('bahía') ||
    t.includes('bahia') ||
    t.includes('cholón') ||
    t.includes('cholon') ||
    t.includes('palma') ||
    t.includes('pacífico') ||
    t.includes('pacifico')
  ) {
    return 'PLAYA_NAUTICO';
  }
  if (
    t.includes('tayrona') ||
    t.includes('cafetero') ||
    t.includes('quindío') ||
    t.includes('quindio') ||
    t.includes('naturaleza') ||
    t.includes('parque') ||
    t.includes('ecológico') ||
    t.includes('ecologico') ||
    t.includes('ballenas') ||
    t.includes('selva') ||
    t.includes('amazonas')
  ) {
    return 'NATURALEZA';
  }
  if (
    t.includes('aventura') ||
    t.includes('rafting') ||
    t.includes('parapente') ||
    t.includes('cañón') ||
    t.includes('canon') ||
    t.includes('trekking') ||
    t.includes('caminata')
  ) {
    return 'AVENTURA';
  }
  return 'CULTURAL_CIUDAD';
}

/**
 * Formatea el horario para excursiones y tours.
 */
export function formatearHorarioExcursion(
  noches: number,
  nombre?: string,
  descripcion?: string,
): string {
  if (noches > 0) {
    return `${noches + 1} días / ${noches} noches`;
  }
  const texto = `${nombre ?? ''} ${descripcion ?? ''}`.toLowerCase();
  if (texto.includes('tarde') || texto.includes('14:')) return '14:00 - 19:30';
  if (texto.includes('nocturno') || texto.includes('noche')) return '18:30 - 22:30';
  return '07:30 - 16:30';
}

/**
 * Determina si el tour exige el aviso de tasa portuaria / impuesto de muelle en destino.
 */
export function requiereAvisoImpuestoMuelle(destino: string, paqueteNombre: string): boolean {
  const normalizado = `${destino} ${paqueteNombre}`.toLowerCase();
  return (
    normalizado.includes('cartagena') ||
    normalizado.includes('rosario') ||
    normalizado.includes('barú') ||
    normalizado.includes('baru') ||
    normalizado.includes('cholón') ||
    normalizado.includes('cholon') ||
    normalizado.includes('tierra bomba') ||
    normalizado.includes('san cipriano') ||
    normalizado.includes('pianguita') ||
    normalizado.includes('magüipí') ||
    normalizado.includes('maguipi') ||
    normalizado.includes('muelle') ||
    normalizado.includes('náutico') ||
    normalizado.includes('nautico') ||
    normalizado.includes('isla') ||
    normalizado.includes('bote') ||
    normalizado.includes('lancha')
  );
}

/**
 * Extrae o sugiere chips de inclusiones coherentes para el catálogo.
 */
export function obtenerInclusionesProducto(
  inclusiones?: string[],
  destino?: string,
  nombre?: string,
): string[] {
  if (inclusiones && inclusiones.length > 0) {
    return inclusiones;
  }
  const t = `${destino ?? ''} ${nombre ?? ''}`.toLowerCase();
  if (t.includes('rosario') || t.includes('isla') || t.includes('barú')) {
    return ['Transporte en lancha rápida', 'Almuerzo típico caribeño', 'Snorkel con careta guiado'];
  }
  if (t.includes('cafetero') || t.includes('consotá') || t.includes('puebleando')) {
    return ['Transporte terrestre especial', 'Entradas a atracciones', 'Almuerzo típico'];
  }
  return ['Transporte turístico', 'Guía profesional', 'Seguro de asistencia médica'];
}

/**
 * Agrupa una lista plana de SalidaPublicada por producto para renderizar
 * tarjetas de catálogo ricas con múltiples fechas/chips de cupo (T-018).
 */
export function agruparSalidasPorProducto(salidas: SalidaPublicada[]): ProductoCatalogoAgrupado[] {
  const mapa = new Map<string, ProductoCatalogoAgrupado>();

  for (const s of salidas) {
    let prod = mapa.get(s.paqueteId);
    if (!prod) {
      const noches = s.noches;
      const dias = noches === 0 ? 1 : noches + 1;
      const tipoTurismo = detectarTipoTurismo(s.destino, s.paqueteNombre);
      const horario = formatearHorarioExcursion(noches, s.paqueteNombre);
      const reqMuelle = requiereAvisoImpuestoMuelle(s.destino, s.paqueteNombre);
      const inclusiones = obtenerInclusionesProducto([], s.destino, s.paqueteNombre);

      prod = {
        paqueteId: s.paqueteId,
        nombre: s.paqueteNombre,
        destino: s.destino,
        noches,
        dias,
        tipoTurismo,
        horario,
        inclusiones,
        exclusiones: ['Gastos no especificados', 'Propinas voluntarias'],
        requiereImpuestoMuelle: reqMuelle,
        precioDesde: s.desde,
        precioEtiqueta: obtenerEtiquetaPrecio(s.desde),
        tienePromo: s.tarifas > 1 || s.presentacion?.promoVigente === true,
        desdeEsDeGrupo: s.desdeEsDeGrupo,
        salidas: [],
        ...(s.presentacion ? { presentacion: s.presentacion } : {}),
      };
      mapa.set(s.paqueteId, prod);
    }

    const prodActual = prod;
    prodActual.salidas.push(formatearChipSalida(s));

    // Actualizar menor precio si esta salida es más económica
    if (s.desde && prodActual.precioDesde) {
      if (Number(s.desde.unidades) < Number(prodActual.precioDesde.unidades)) {
        prodActual.precioDesde = s.desde;
        prodActual.precioEtiqueta = obtenerEtiquetaPrecio(s.desde);
        if (s.presentacion) prodActual.presentacion = s.presentacion;
      }
    } else if (s.desde && !prodActual.precioDesde) {
      prodActual.precioDesde = s.desde;
      prodActual.precioEtiqueta = obtenerEtiquetaPrecio(s.desde);
      if (s.presentacion) prodActual.presentacion = s.presentacion;
    }

    if (s.tarifas > 1 || s.presentacion?.promoVigente) {
      prodActual.tienePromo = true;
    }
    if (s.desdeEsDeGrupo) {
      prodActual.desdeEsDeGrupo = true;
    }
  }

  // Ordenar salidas por fecha en cada producto
  for (const prod of mapa.values()) {
    prod.salidas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  return Array.from(mapa.values());
}
