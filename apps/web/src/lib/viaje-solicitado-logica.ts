/**
 * Composición del «viaje» de un contacto para la bandeja y el pipeline (auditoría UX, I1 e I2).
 *
 * El viaje es la unidad, no el contacto: «Cancún · dic · 2+2» y el plazo que vence primero. Aquí
 * solo se COMPONE texto y se elige entre fuentes que ya trae el contrato (oportunidad de `crm`,
 * archivo de viaje, cotización de `quoting`). No se calcula nada de negocio (R3, R4, R8): ningún
 * importe se suma ni se convierte; la venta se pasa tal cual la dio el servidor.
 *
 * Las fechas de viaje son fechas de calendario (`AAAA-MM-DD`, sin zona); los plazos que llegan como
 * instante se pasan al día de la zona de la agencia antes de contar días (R9).
 */
import type { Dinero, EstadoCotizacion, Oportunidad, ResumenDeArchivo } from '@viajapro/contracts';
import { ZONA_HORARIA_COLOMBIA } from './formato';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA_MS = 86_400_000;

export interface PasajerosDelViaje {
  adultos: number;
  ninos: number;
  infantes: number;
}

export type NivelDePlazo = 'vencido' | 'hoy' | 'proximo' | 'normal';

export interface PlazoDelViaje {
  /** Qué vence: «Time limit», «Cotización vence». */
  etiqueta: string;
  /** Texto relativo: «hoy», «mañana», «en 5 días», «hace 2 días». */
  cuando: string;
  nivel: NivelDePlazo;
}

export interface CotizacionDelViaje {
  id: string;
  titulo: string;
  version: number;
  venta: Dinero;
  vigenteHasta: string | null;
  estado: EstadoCotizacion | null;
}

export interface ViajeDeContacto {
  destino: string | null;
  fechaSalida: string | null;
  pasajeros: PasajerosDelViaje | null;
  plazo: PlazoDelViaje | null;
  cotizacion: CotizacionDelViaje | null;
  archivo: { id: string; numero: number } | null;
  oportunidadId: string | null;
  paqueteId: string | null;
}

export type OportunidadParaViaje = Pick<
  Oportunidad,
  'id' | 'destino' | 'fechaSalida' | 'paqueteId'
>;
export type ArchivoParaViaje = Pick<
  ResumenDeArchivo,
  | 'id'
  | 'numero'
  | 'oportunidadId'
  | 'destino'
  | 'fechaSalida'
  | 'adultos'
  | 'ninos'
  | 'infantes'
  | 'proximoPlazo'
>;

export interface CotizacionParaViaje extends CotizacionDelViaje {
  destino?: string | null;
  fechaSalida?: string | null;
  pasajeros?: PasajerosDelViaje | null;
}

export interface EntradaDeViaje {
  oportunidad?: OportunidadParaViaje | null;
  archivo?: ArchivoParaViaje | null;
  cotizacion?: CotizacionParaViaje | null;
  ahora?: number;
}

function partesDeFecha(fecha: string): { y: number; m: number; d: number } | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!r) return null;
  const m = Number(r[2]);
  if (m < 1 || m > 12) return null;
  return { y: Number(r[1]), m, d: Number(r[3]) };
}

/** Día de calendario (`AAAA-MM-DD`) de un instante, visto en la zona de la agencia (R9). */
export function diaEnZona(ms: number, zona: string = ZONA_HORARIA_COLOMBIA): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Días de calendario entre dos `AAAA-MM-DD` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  const a = partesDeFecha(desde);
  const b = partesDeFecha(hasta);
  if (!a || !b) return Number.NaN;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DIA_MS);
}

/**
 * «Cancún, México» → «Cancún». Con exactamente «ciudad, país» se queda con la ciudad; con una lista
 * («Madrid, París, Roma») se deja entera, porque ahí cada parte es un destino.
 */
export function nombreCortoDeDestino(destino: string | null | undefined): string | null {
  const limpio = destino?.trim();
  if (!limpio) return null;
  const partes = limpio
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 2) return partes[0] ?? null;
  return partes.length > 0 ? partes.join(', ') : null;
}

/** «dic» y, si no es el año en curso, «dic 2027». `null` si no hay fecha válida. */
export function mesDeSalida(
  fecha: string | null | undefined,
  ahora: number = Date.now(),
): string | null {
  if (!fecha) return null;
  const p = partesDeFecha(fecha);
  if (!p) return null;
  const mes = MESES[p.m - 1]!;
  const anioActual = Number(diaEnZona(ahora).slice(0, 4));
  return p.y === anioActual ? mes : `${mes} ${p.y}`;
}

/** «15 dic 2026». El año siempre: es el formato de fecha del sistema. */
export function fechaDeSalidaTexto(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const p = partesDeFecha(fecha);
  if (!p) return null;
  return `${p.d} ${MESES[p.m - 1]!} ${p.y}`;
}

/** «2+2» o «2+2+1» (adultos + niños + infantes). Con solo adultos, el número solo. */
export function pasajerosCorto(p: PasajerosDelViaje | null | undefined): string | null {
  if (!p) return null;
  if (p.adultos + p.ninos + p.infantes === 0) return null;
  if (p.infantes > 0) return `${p.adultos}+${p.ninos}+${p.infantes}`;
  return p.ninos > 0 ? `${p.adultos}+${p.ninos}` : String(p.adultos);
}

/** «2 adultos · 2 niños · 1 infante», con plurales correctos y sin los grupos en cero. */
export function pasajerosEnLetras(p: PasajerosDelViaje | null | undefined): string | null {
  if (!p) return null;
  const partes: string[] = [];
  if (p.adultos > 0) partes.push(`${p.adultos} ${p.adultos === 1 ? 'adulto' : 'adultos'}`);
  if (p.ninos > 0) partes.push(`${p.ninos} ${p.ninos === 1 ? 'niño' : 'niños'}`);
  if (p.infantes > 0) partes.push(`${p.infantes} ${p.infantes === 1 ? 'infante' : 'infantes'}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** «Cancún · dic · 2+2». Omite lo que no se sabe; `null` si no se sabe nada. */
export function lineaDeViaje(
  v: Pick<ViajeDeContacto, 'destino' | 'fechaSalida' | 'pasajeros'>,
  ahora: number = Date.now(),
): string | null {
  const partes = [
    nombreCortoDeDestino(v.destino),
    mesDeSalida(v.fechaSalida, ahora),
    pasajerosCorto(v.pasajeros),
  ].filter((x): x is string => Boolean(x));
  return partes.length > 0 ? partes.join(' · ') : null;
}

function cuandoTexto(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

/**
 * Cuándo vence algo, en días de calendario de la agencia. Rojo es solo para lo vencido y lo que
 * vence hoy; ámbar para los próximos 3 días; el resto, neutro.
 */
export function describirVencimiento(
  cuando: string,
  ahora: number = Date.now(),
): { cuando: string; nivel: NivelDePlazo; dias: number } | null {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(cuando)
    ? cuando
    : Number.isNaN(Date.parse(cuando))
      ? null
      : diaEnZona(Date.parse(cuando));
  if (!dia) return null;
  const dias = diasEntre(diaEnZona(ahora), dia);
  if (Number.isNaN(dias)) return null;
  const nivel: NivelDePlazo =
    dias < 0 ? 'vencido' : dias === 0 ? 'hoy' : dias <= 3 ? 'proximo' : 'normal';
  return { cuando: cuandoTexto(dias), nivel, dias };
}

export interface CandidatoDePlazo {
  etiqueta: string;
  cuando: string | null | undefined;
}

/** El plazo que vence primero (lo vencido va antes). `null` si no hay ninguno. */
export function plazoMasProximo(
  candidatos: CandidatoDePlazo[],
  ahora: number = Date.now(),
): PlazoDelViaje | null {
  let mejor: { plazo: PlazoDelViaje; dias: number } | null = null;
  for (const c of candidatos) {
    if (!c.cuando) continue;
    const d = describirVencimiento(c.cuando, ahora);
    if (!d) continue;
    if (!mejor || d.dias < mejor.dias) {
      mejor = { plazo: { etiqueta: c.etiqueta, cuando: d.cuando, nivel: d.nivel }, dias: d.dias };
    }
  }
  return mejor?.plazo ?? null;
}

/** Las cotizaciones que ya no corren (aceptada, rechazada, vencida) no aportan plazo. */
export function cotizacionCorre(estado: EstadoCotizacion | null | undefined): boolean {
  return estado === null || estado === undefined || estado === 'BORRADOR' || estado === 'ENVIADA';
}

/**
 * La cotización vigente de una lista ordenada de la más reciente a la más vieja (como la entrega
 * `quoting`): la primera que no esté rechazada ni vencida.
 */
export function cotizacionVigente<T extends { estado: EstadoCotizacion }>(filas: T[]): T | null {
  return filas.find((f) => f.estado !== 'RECHAZADA' && f.estado !== 'VENCIDA') ?? null;
}

/**
 * Junta las fuentes en un solo viaje. Prioridad para destino y fecha: el archivo (el viaje ya
 * confirmado), luego la oportunidad (lo que pide el cliente), luego la cotización. Los pasajeros
 * salen del archivo o, si no hay, de la cotización: la oportunidad no los trae todavía.
 */
export function componerViaje(entrada: EntradaDeViaje): ViajeDeContacto {
  const { oportunidad, archivo, cotizacion } = entrada;
  const ahora = entrada.ahora ?? Date.now();

  const destino =
    archivo?.destino?.trim() || oportunidad?.destino?.trim() || cotizacion?.destino?.trim() || null;
  const fechaSalida =
    archivo?.fechaSalida ?? oportunidad?.fechaSalida ?? cotizacion?.fechaSalida ?? null;
  const pasajeros: PasajerosDelViaje | null = archivo
    ? { adultos: archivo.adultos, ninos: archivo.ninos, infantes: archivo.infantes }
    : (cotizacion?.pasajeros ?? null);

  const plazo = plazoMasProximo(
    [
      { etiqueta: 'Time limit', cuando: archivo?.proximoPlazo },
      {
        etiqueta: 'Cotización vence',
        cuando: cotizacion && cotizacionCorre(cotizacion.estado) ? cotizacion.vigenteHasta : null,
      },
    ],
    ahora,
  );

  return {
    destino,
    fechaSalida,
    pasajeros,
    plazo,
    cotizacion: cotizacion
      ? {
          id: cotizacion.id,
          titulo: cotizacion.titulo,
          version: cotizacion.version,
          venta: cotizacion.venta,
          vigenteHasta: cotizacion.vigenteHasta,
          estado: cotizacion.estado,
        }
      : null,
    archivo: archivo ? { id: archivo.id, numero: archivo.numero } : null,
    oportunidadId: oportunidad?.id ?? null,
    paqueteId: oportunidad?.paqueteId ?? null,
  };
}

/** Salida de una oportunidad en el tablero: «15 dic 2026» o «sin fecha», con su nivel de alerta. */
export function describirSalida(
  fecha: string | null | undefined,
  abierta: boolean,
  ahora: number = Date.now(),
): { texto: string; nivel: NivelDePlazo | 'sin-fecha'; ayuda: string } {
  const texto = fechaDeSalidaTexto(fecha);
  if (!texto || !fecha) {
    return {
      texto: 'sin fecha',
      nivel: 'sin-fecha',
      ayuda: 'Esta oportunidad no tiene fecha de salida',
    };
  }
  const dias = diasEntre(diaEnZona(ahora), fecha);
  if (!abierta || Number.isNaN(dias)) {
    return { texto, nivel: 'normal', ayuda: `Salida el ${texto}` };
  }
  if (dias < 0) {
    return { texto, nivel: 'vencido', ayuda: `La fecha de salida (${texto}) ya pasó` };
  }
  if (dias === 0) return { texto, nivel: 'hoy', ayuda: `Sale hoy (${texto})` };
  if (dias <= 7) {
    return { texto, nivel: 'proximo', ayuda: `Sale ${cuandoTexto(dias)} (${texto})` };
  }
  return { texto, nivel: 'normal', ayuda: `Sale en ${dias} días (${texto})` };
}

export interface DatosParaCotizar {
  contactoId: string;
  conversacionId?: string | undefined;
  oportunidadId?: string | null | undefined;
  paqueteId?: string | null | undefined;
  destino?: string | null | undefined;
  fechaSalida?: string | null | undefined;
  pasajeros?: PasajerosDelViaje | null | undefined;
}

/**
 * Dirección del cotizador con lo que ya se sabe del viaje. Solo viajan datos de la solicitud (no
 * importes); el cotizador vuelve a cotizar contra el servidor.
 */
export function enlaceParaCotizar(d: DatosParaCotizar): string {
  const q = new URLSearchParams();
  q.set('contactoId', d.contactoId);
  if (d.conversacionId) q.set('conversacion', d.conversacionId);
  if (d.oportunidadId) q.set('oportunidadId', d.oportunidadId);
  if (d.paqueteId) q.set('paqueteId', d.paqueteId);
  else if (d.destino?.trim()) q.set('destino', d.destino.trim());
  if (d.fechaSalida && partesDeFecha(d.fechaSalida)) q.set('fecha', d.fechaSalida.slice(0, 10));
  if (d.pasajeros) {
    if (d.pasajeros.adultos > 0) q.set('adultos', String(d.pasajeros.adultos));
    if (d.pasajeros.ninos > 0) q.set('ninos', String(d.pasajeros.ninos));
    if (d.pasajeros.infantes > 0) q.set('infantes', String(d.pasajeros.infantes));
  }
  return `/cotizador?${q.toString()}`;
}

/** Entero de la URL dentro de un rango; cualquier otra cosa (vacío, texto, negativo) es `null`. */
export function enteroDeUrl(valor: string | null, min: number, max: number): number | null {
  if (valor === null || !/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  return n >= min && n <= max ? n : null;
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * El paquete del catálogo que corresponde a un destino pedido («Cancún, México» → el de «Cancún»).
 * Sin tildes ni mayúsculas; `null` si ninguno coincide (el cotizador sigue con su primero).
 */
export function paquetePorDestino<T extends { id: string; destino: string }>(
  paquetes: T[],
  destino: string | null | undefined,
): T | null {
  const buscado = sinTildes(nombreCortoDeDestino(destino) ?? '');
  if (!buscado) return null;
  return (
    paquetes.find((p) => {
      const d = sinTildes(nombreCortoDeDestino(p.destino) ?? '');
      return d !== '' && (d === buscado || d.includes(buscado) || buscado.includes(d));
    }) ?? null
  );
}
