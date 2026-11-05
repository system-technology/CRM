/**
 * Conversión de «este mes», «últimos 30 días»… a los dos instantes UTC que pide
 * `GET /api/v1/reportes/resumen` (R9): `desde` inclusivo, `hasta` exclusivo.
 *
 * La zona horaria de la agencia se aplica AQUÍ (el servidor no interpreta husos al contar).
 * Los días calendario se cuentan en esa zona: el «día» de una agencia en Bogotá empieza a las
 * 05:00 UTC, no a las 00:00 UTC.
 */
import { MAXIMO_DIAS_DE_REPORTE } from '@viajapro/contracts';
import { ZONA_HORARIA_COLOMBIA } from './formato';

export type PeriodoDeReporte = 'ultimos_30_dias' | 'este_mes' | 'trimestre' | 'ano';

export interface RangoDeInstantes {
  /** Instante UTC ISO 8601, inclusivo. */
  desde: string;
  /** Instante UTC ISO 8601, exclusivo. */
  hasta: string;
}

interface FechaLocal {
  anio: number;
  mes: number; // 1-12
  dia: number;
}

function partesEnZona(instante: number, zona: string): Record<string, number> {
  const formateador = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const partes: Record<string, number> = {};
  for (const p of formateador.formatToParts(new Date(instante))) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  return partes;
}

/** Desfase de la zona respecto a UTC en ese instante, en milisegundos (Bogotá: -5 h). */
function desfaseDeZonaMs(instante: number, zona: string): number {
  const p = partesEnZona(instante, zona);
  const comoUtc = Date.UTC(
    p['year'] ?? 1970,
    (p['month'] ?? 1) - 1,
    p['day'] ?? 1,
    p['hour'] ?? 0,
    p['minute'] ?? 0,
    p['second'] ?? 0,
  );
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/**
 * Instante UTC en que empieza el día calendario `anio-mes-dia` en `zona`.
 * Admite desbordes (`dia` 0 o 32, `mes` 13): se normalizan como en `Date.UTC`.
 */
export function inicioDeDiaEnZona(
  anio: number,
  mes: number,
  dia: number,
  zona: string = ZONA_HORARIA_COLOMBIA,
): Date {
  const nominal = Date.UTC(anio, mes - 1, dia);
  // Dos pasadas: la segunda corrige el caso en que el desfase cambia (horario de verano).
  const primera = nominal - desfaseDeZonaMs(nominal, zona);
  return new Date(nominal - desfaseDeZonaMs(primera, zona));
}

/** Día calendario de `instante` visto desde `zona`. */
export function fechaLocalEnZona(instante: Date, zona: string = ZONA_HORARIA_COLOMBIA): FechaLocal {
  const p = partesEnZona(instante.getTime(), zona);
  return { anio: p['year'] ?? 1970, mes: p['month'] ?? 1, dia: p['day'] ?? 1 };
}

/**
 * Rango UTC de un periodo, hasta el final del día de hoy (en la zona de la agencia):
 *  - `ultimos_30_dias`: 30 días calendario contando hoy.
 *  - `este_mes`: desde el día 1 del mes en curso.
 *  - `trimestre`: 90 días calendario contando hoy.
 *  - `ano`: desde el 1 de enero del año en curso.
 */
export function rangoDePeriodo(
  periodo: PeriodoDeReporte,
  ahora: Date = new Date(),
  zona: string = ZONA_HORARIA_COLOMBIA,
): RangoDeInstantes {
  const { anio, mes, dia } = fechaLocalEnZona(ahora, zona);
  const hasta = inicioDeDiaEnZona(anio, mes, dia + 1, zona);

  let desde: Date;
  switch (periodo) {
    case 'ultimos_30_dias':
      desde = inicioDeDiaEnZona(anio, mes, dia - 29, zona);
      break;
    case 'este_mes':
      desde = inicioDeDiaEnZona(anio, mes, 1, zona);
      break;
    case 'trimestre':
      desde = inicioDeDiaEnZona(anio, mes, dia - 89, zona);
      break;
    case 'ano':
      desde = inicioDeDiaEnZona(anio, 1, 1, zona);
      break;
  }

  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/**
 * Periodo inmediatamente anterior y de igual duración (para pedir la variación con otra llamada).
 * Devuelve `null` si el rango anterior excedería el máximo del contrato.
 */
export function rangoAnterior(rango: RangoDeInstantes): RangoDeInstantes | null {
  const d = Date.parse(rango.desde);
  const h = Date.parse(rango.hasta);
  const duracion = h - d;
  if (!(duracion > 0) || duracion > MAXIMO_DIAS_DE_REPORTE * 24 * 60 * 60 * 1000) return null;
  return { desde: new Date(d - duracion).toISOString(), hasta: rango.desde };
}

/** Número de días calendario del rango (aprox., para rotular «vs. los N días anteriores»). */
export function diasDelRango(rango: RangoDeInstantes): number {
  return Math.round((Date.parse(rango.hasta) - Date.parse(rango.desde)) / (24 * 60 * 60 * 1000));
}
