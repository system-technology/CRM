/**
 * Lógica pura de la propuesta al viajero (`/cotizaciones/[id]/imprimir`, auditoría UX 2026-11-20 I3).
 *
 * Regla de fondo: **nada se inventa.** El catálogo hoy no guarda itinerario por días, hotel con
 * nombre, vuelos con horario ni imágenes. Lo que esta lógica arma sale solo de datos reales:
 * la fecha de salida y la duración de la versión, el plan de alimentación, las inclusiones y
 * exclusiones del producto, su opción de salida (hora y punto de encuentro) y, si la descripción
 * del producto trae líneas «Día N: …», esas líneas tal cual.
 */

import type { Acomodacion, CargoEnDestino, Paquete, PlanAlimentacion } from '@viajapro/contracts';

/** Lo que la propuesta lee del producto. Todo opcional: si el detalle no carga, la pieza sale igual. */
export type ProductoDePropuesta = Pick<
  Paquete,
  'dias' | 'planAlimentacion' | 'inclusiones' | 'exclusiones' | 'descripcion'
> & {
  cargosEnDestino?: CargoEnDestino[] | undefined;
  opcionesDeSalida?: Paquete['opcionesDeSalida'];
};

const MS_DIA = 24 * 60 * 60 * 1000;

/** Suma días a una fecha de viaje `AAAA-MM-DD` sin pasar por la zona horaria local (R9). */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
  return new Date(base + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Días del viaje: los del producto si se conocen; si no, noches + 1 (la forma normal). */
export function diasDelViaje(noches: number, producto?: Pick<ProductoDePropuesta, 'dias'> | null) {
  return producto?.dias ?? noches + 1;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «2 adultos y 1 niño», «1 adulto, 2 niños y 1 infante». Plurales correctos (diseno-web §4). */
export function textoViajeros(adultos: number, ninos: number, infantes: number): string {
  const partes = [
    adultos > 0 ? plural(adultos, 'adulto', 'adultos') : null,
    ninos > 0 ? plural(ninos, 'niño', 'niños') : null,
    infantes > 0 ? plural(infantes, 'infante', 'infantes') : null,
  ].filter((p): p is string => p !== null);
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

export function textoDuracion(dias: number, noches: number): string {
  return `${plural(dias, 'día', 'días')} y ${plural(noches, 'noche', 'noches')}`;
}

export const ETIQUETA_PLAN: Record<PlanAlimentacion, string> = {
  TODO_INCLUIDO: 'Todo incluido',
  DESAYUNO: 'Con desayuno',
  MEDIA_PENSION: 'Media pensión',
  PENSION_COMPLETA: 'Pensión completa',
  SIN_ALIMENTACION: 'Sin alimentación',
};

export const ETIQUETA_HABITACION: Record<Acomodacion, string> = {
  SENCILLA: 'Habitación sencilla',
  DOBLE: 'Habitación doble',
  TRIPLE: 'Habitación triple',
  CUADRUPLE: 'Habitación cuádruple',
};

// -----------------------------------------------------------------------------
// Lo que incluye, agrupado por lo que el viajero busca primero
// -----------------------------------------------------------------------------

export type GrupoDeInclusion = 'VUELOS' | 'ALOJAMIENTO' | 'TRASLADOS' | 'ASISTENCIA' | 'OTROS';

export const ORDEN_GRUPOS: readonly GrupoDeInclusion[] = [
  'VUELOS',
  'ALOJAMIENTO',
  'TRASLADOS',
  'ASISTENCIA',
  'OTROS',
];

export const TITULO_GRUPO: Record<GrupoDeInclusion, string> = {
  VUELOS: 'Vuelos',
  ALOJAMIENTO: 'Alojamiento y alimentación',
  TRASLADOS: 'Traslados',
  ASISTENCIA: 'Asistencia y seguros',
  OTROS: 'Además',
};

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PATRONES: readonly [GrupoDeInclusion, RegExp][] = [
  ['VUELOS', /\b(tiquete|tiquetes|vuelo|vuelos|aereo|aereos|aerolinea)\b/],
  ['TRASLADOS', /\b(traslado|traslados|transfer|transporte)\b/],
  [
    'ALOJAMIENTO',
    /\b(alojamiento|hotel|hospedaje|habitacion|acomodacion|noches?|resort|crucero|desayuno|almuerzo|cena|alimentacion|pension)\b/,
  ],
  ['ASISTENCIA', /\b(seguro|asistencia|tarjeta de asistencia)\b/],
];

/**
 * Clasifica una inclusión por palabras clave. Es presentación, no dominio: si no encaja, va a
 * «Además». Los traslados se miran antes que el alojamiento porque «aeropuerto — hotel» es traslado.
 */
export function grupoDeInclusion(texto: string): GrupoDeInclusion {
  const t = normalizar(texto);
  for (const [grupo, patron] of PATRONES) if (patron.test(t)) return grupo;
  return 'OTROS';
}

export function agruparInclusiones(
  inclusiones: readonly string[],
): { grupo: GrupoDeInclusion; items: string[] }[] {
  const mapa = new Map<GrupoDeInclusion, string[]>();
  for (const inc of inclusiones) {
    const texto = inc.trim();
    if (!texto) continue;
    const g = grupoDeInclusion(texto);
    mapa.set(g, [...(mapa.get(g) ?? []), texto]);
  }
  return ORDEN_GRUPOS.filter((g) => mapa.has(g)).map((g) => ({ grupo: g, items: mapa.get(g)! }));
}

// -----------------------------------------------------------------------------
// Itinerario día a día
// -----------------------------------------------------------------------------

export interface DiaDeItinerario {
  /** Primer día del tramo (1 = día de salida). */
  desde: number;
  /** Último día del tramo; igual a `desde` si es un solo día. */
  hasta: number;
  /** Fecha del primer día del tramo, `AAAA-MM-DD`. */
  fecha: string;
  /** Fecha del último día del tramo. */
  fechaHasta: string;
  titulo: string;
  detalle: string[];
  tipo: 'SALIDA' | 'ESTADIA' | 'REGRESO' | 'DIA';
}

/** Líneas «Día 1: …», «Día 2 - …», «Dia 3. …» de la descripción del producto. */
export function leerDiasDeLaDescripcion(
  descripcion: string | null | undefined,
): Map<number, string> {
  const dias = new Map<number, string>();
  if (!descripcion) return dias;
  for (const linea of descripcion.split(/\r?\n/)) {
    const m = /^\s*d[ií]a\s+(\d{1,3})\s*[:.\-–—]\s*(.+)$/i.exec(linea);
    if (m?.[1] && m[2]) dias.set(Number(m[1]), m[2].trim());
  }
  return dias;
}

/** La descripción sin las líneas «Día N», para no repetirlas fuera del itinerario. */
export function descripcionSinDias(descripcion: string | null | undefined): string {
  if (!descripcion) return '';
  return descripcion
    .split(/\r?\n/)
    .filter((l) => !/^\s*d[ií]a\s+\d{1,3}\s*[:.\-–—]/i.test(l))
    .join('\n')
    .trim();
}

export interface EntradaItinerario {
  fechaSalida: string;
  dias: number;
  destino: string;
  planAlimentacion?: PlanAlimentacion | null | undefined;
  inclusiones?: readonly string[] | undefined;
  descripcion?: string | null | undefined;
  opcionDeSalida?: {
    etiqueta: string;
    horaSalida: string | null;
    horaRegreso: string | null;
    puntoDeEncuentro: string | null;
  } | null;
}

/**
 * Arma el itinerario. Si la descripción trae los días, manda ella (un tramo por día). Si no, un
 * esqueleto honesto con lo que sí se sabe: salida, estadía y regreso, cada uno con su fecha.
 */
export function construirItinerario(e: EntradaItinerario): DiaDeItinerario[] {
  const dias = Math.max(1, e.dias);
  const fechaDe = (n: number) => sumarDias(e.fechaSalida, n - 1);
  const delTexto = leerDiasDeLaDescripcion(e.descripcion);

  if (delTexto.size > 0) {
    const resultado: DiaDeItinerario[] = [];
    for (let n = 1; n <= dias; n++) {
      const texto = delTexto.get(n);
      const tipo = n === 1 ? 'SALIDA' : n === dias && dias > 1 ? 'REGRESO' : 'DIA';
      resultado.push({
        desde: n,
        hasta: n,
        fecha: fechaDe(n),
        fechaHasta: fechaDe(n),
        titulo:
          texto ?? (tipo === 'SALIDA' ? 'Salida' : tipo === 'REGRESO' ? 'Regreso' : 'Día libre'),
        detalle: n === 1 ? detalleDeSalida(e) : n === dias ? detalleDeRegreso(e) : [],
        tipo,
      });
    }
    return resultado;
  }

  const conVuelo = (e.inclusiones ?? []).some((i) => grupoDeInclusion(i) === 'VUELOS');
  const plan = e.planAlimentacion ? ETIQUETA_PLAN[e.planAlimentacion] : null;

  if (dias === 1) {
    return [
      {
        desde: 1,
        hasta: 1,
        fecha: fechaDe(1),
        fechaHasta: fechaDe(1),
        titulo: `Día en ${e.destino}`,
        detalle: [...detalleDeSalida(e), ...detalleDeRegreso(e)],
        tipo: 'SALIDA',
      },
    ];
  }

  const tramos: DiaDeItinerario[] = [
    {
      desde: 1,
      hasta: 1,
      fecha: fechaDe(1),
      fechaHasta: fechaDe(1),
      titulo: conVuelo ? `Vuelo y llegada a ${e.destino}` : `Llegada a ${e.destino}`,
      detalle: detalleDeSalida(e),
      tipo: 'SALIDA',
    },
  ];
  if (dias > 2) {
    tramos.push({
      desde: 2,
      hasta: dias - 1,
      fecha: fechaDe(2),
      fechaHasta: fechaDe(dias - 1),
      titulo: `Estadía en ${e.destino}`,
      detalle:
        plan && e.planAlimentacion !== 'SIN_ALIMENTACION' ? [`Plan ${plan.toLowerCase()}`] : [],
      tipo: 'ESTADIA',
    });
  }
  tramos.push({
    desde: dias,
    hasta: dias,
    fecha: fechaDe(dias),
    fechaHasta: fechaDe(dias),
    titulo: conVuelo ? 'Vuelo de regreso' : 'Regreso',
    detalle: detalleDeRegreso(e),
    tipo: 'REGRESO',
  });
  return tramos;
}

function detalleDeSalida(e: EntradaItinerario): string[] {
  const o = e.opcionDeSalida;
  if (!o) return [];
  return [
    o.horaSalida ? `Salida a las ${o.horaSalida}` : null,
    o.puntoDeEncuentro ? `Punto de encuentro: ${o.puntoDeEncuentro}` : null,
  ].filter((x): x is string => x !== null);
}

function detalleDeRegreso(e: EntradaItinerario): string[] {
  const o = e.opcionDeSalida;
  return o?.horaRegreso ? [`Regreso a las ${o.horaRegreso}`] : [];
}

/** «Día 1», «Días 2 a 3». */
export function etiquetaDeTramo(d: Pick<DiaDeItinerario, 'desde' | 'hasta'>): string {
  return d.desde === d.hasta ? `Día ${d.desde}` : `Días ${d.desde} a ${d.hasta}`;
}

/** Referencia corta y legible de la propuesta: los 6 últimos del id y la versión. */
export function referenciaDePropuesta(cotizacionId: string, version: number): string {
  return `${cotizacionId.replace(/-/g, '').slice(-6).toUpperCase()}-v${version}`;
}

/**
 * El RNT que puede imprimirse en un documento hacia el viajero: solo el que la plataforma verificó
 * (ADR-0030 §3.3). Lo que declara la agencia sin verificar no se imprime, aunque exista; y si el
 * dato falta o es de una API anterior, tampoco: nunca se inventa.
 */
export function rntImprimible(ajustes: {
  rnt?: string | null | undefined;
  rntVerificado?: boolean | undefined;
}): string | null {
  if (ajustes.rntVerificado !== true) return null;
  const rnt = ajustes.rnt?.trim();
  return rnt ? rnt : null;
}
