/**
 * Módulo único de formato para es-CO (T-022)
 *
 * Centraliza las reglas de presentación para el mercado colombiano (ViajaPro):
 * 1. Dinero: COP en enteros, sin decimales, con punto de miles (R8).
 *    Monedas extranjeras (USD, EUR) con 2 decimales y coma decimal.
 * 2. Fechas: zona de la agencia (R9; por defecto 'America/Bogota'). Un solo formato en toda la
 *    interfaz: «20 nov 2026» y «20 nov 2026, 10:30 a. m.».
 *    Manejo preciso de la medianoche UTC frente a la zona de la agencia.
 * 3. Teléfonos: Formato colombiano «+57 300 123 4567» para móviles (10 dígitos)
 *    y «+57 (601) 234 5678» para fijos nacionales.
 * 4. Cupos: «Agotado», «1 cupo disponible», «12 de 20 cupos», «12 cupos disponibles».
 */

export const ZONA_HORARIA_COLOMBIA = 'America/Bogota';
export const LOCALE_COLOMBIA = 'es-CO';

export interface DineroObjeto {
  unidades?: string | number | undefined;
  monto?: string | number | undefined;
  moneda?: string | undefined;
}

export type EntradaDinero = DineroObjeto | number | bigint | string | null | undefined;

export interface OpcionesFormatoDinero {
  moneda?: string | undefined;
  conCodigo?: boolean | undefined;
}

export interface OpcionesFormatoFecha {
  zona?: string | undefined;
  estilo?: 'corta' | 'completa' | 'dia-mes' | 'hora' | undefined;
  conHora?: boolean | undefined;
}

export interface OpcionesFormatoTelefono {
  incluirCodigoPais?: boolean | undefined;
}

export interface OpcionesFormatoCupo {
  total?: number | null | undefined;
}

/**
 * Normaliza cualquier entrada de dinero (objeto contracts, objeto con monto, número, string o bigint)
 * devolviendo el valor numérico en la unidad principal y el código ISO de moneda.
 */
function extraerMontoYMoneda(
  entrada: EntradaDinero,
  opciones?: OpcionesFormatoDinero,
): { valor: number; moneda: string } {
  const monedaPorDefecto = opciones?.moneda ?? 'COP';

  if (entrada === null || entrada === undefined) {
    return { valor: 0, moneda: monedaPorDefecto };
  }

  if (typeof entrada === 'number') {
    return { valor: Number.isFinite(entrada) ? entrada : 0, moneda: monedaPorDefecto };
  }

  if (typeof entrada === 'bigint') {
    return { valor: Number(entrada), moneda: monedaPorDefecto };
  }

  if (typeof entrada === 'string') {
    const num = Number(entrada);
    return { valor: Number.isFinite(num) ? num : 0, moneda: monedaPorDefecto };
  }

  // Entrada es DineroObjeto
  const moneda = entrada.moneda ?? monedaPorDefecto;

  if (entrada.monto !== undefined) {
    const num = Number(entrada.monto);
    return { valor: Number.isFinite(num) ? num : 0, moneda };
  }

  if (entrada.unidades !== undefined) {
    const decimales = moneda === 'COP' ? 0 : 2;
    const num = Number(entrada.unidades) / 10 ** decimales;
    return { valor: Number.isFinite(num) ? num : 0, moneda };
  }

  return { valor: 0, moneda };
}

/**
 * Formatea un valor monetario según el estándar es-CO.
 * En COP (R8): Entero, sin decimales, con punto de miles.
 * Ejemplo: 350000 -> "$ 350.000"
 */
export function formatearDinero(entrada: EntradaDinero, opciones?: OpcionesFormatoDinero): string {
  const { valor, moneda } = extraerMontoYMoneda(entrada, opciones);
  const esCOP = moneda.toUpperCase() === 'COP';
  const decimales = esCOP ? 0 : 2;

  const formateador = new Intl.NumberFormat(LOCALE_COLOMBIA, {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });

  const texto = formateador.format(valor).replace(/\u00A0/g, ' ');

  if (opciones?.conCodigo && !texto.includes(moneda)) {
    return `${texto} ${moneda}`;
  }

  return texto;
}

/**
 * Conveniencia para formatear exclusivamente en COP.
 */
export function formatearCOP(
  monto: number | bigint | string | null | undefined,
  opciones?: Omit<OpcionesFormatoDinero, 'moneda'>,
): string {
  return formatearDinero(monto, { ...opciones, moneda: 'COP' });
}

/**
 * Formato compacto para cifras en tablas o tarjetas (mantiene equivalencia con pipeline).
 */
export function formatearDineroCifra(dinero: EntradaDinero): string {
  return formatearDinero(dinero);
}

/**
 * Zona horaria de la agencia (R9). La fija el shell cuando carga los ajustes de la agencia
 * (`fijarZonaAgencia`); mientras tanto rige la oficial de Colombia. Una llamada puede imponer
 * otra con `{ zona }`.
 */
let zonaAgenciaVigente = ZONA_HORARIA_COLOMBIA;

export function fijarZonaAgencia(zona: string | null | undefined): void {
  if (!zona) {
    zonaAgenciaVigente = ZONA_HORARIA_COLOMBIA;
    return;
  }
  try {
    new Intl.DateTimeFormat(LOCALE_COLOMBIA, { timeZone: zona });
    zonaAgenciaVigente = zona;
  } catch {
    zonaAgenciaVigente = ZONA_HORARIA_COLOMBIA;
  }
}

export function zonaAgencia(): string {
  return zonaAgenciaVigente;
}

/** Espacios especiales de Intl (\u202f, \u00a0) a espacio normal: igual en servidor y cliente. */
function espaciosNormales(texto: string): string {
  return texto
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fecha sin puntos de abreviación, comas ni «de»: «20 nov 2026». */
function normalizarFechaCorta(texto: string): string {
  return espaciosNormales(texto.replace(/[,.]/g, '').replace(/\s+de\s+/g, ' '));
}

function aInstante(fecha: string | Date | number): Date | null {
  const d = typeof fecha === 'string' || typeof fecha === 'number' ? new Date(fecha) : fecha;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Único formato de fecha de la interfaz: «20 nov 2026». Con `conHora` (o `formatearFechaHora`):
 * «20 nov 2026, 10:30 a. m.» en la zona de la agencia (R9).
 *
 * - `AAAA-MM-DD` (fecha sin hora: salida, vigencia) no se desplaza de día por la zona.
 * - Un instante UTC se traslada a la zona de la agencia.
 * - Estilos: `corta` (por defecto), `dia-mes` («20 nov», solo donde el año sobra), `hora`
 *   («10:30 a. m.») y `completa` («viernes, 20 de noviembre de 2026», solo para textos al viajero).
 */
export function formatearFecha(
  fecha: string | Date | number | null | undefined,
  opciones?: OpcionesFormatoFecha,
): string {
  if (!fecha && fecha !== 0) return '';

  const zona = opciones?.zona ?? zonaAgenciaVigente;
  const estilo = opciones?.estilo ?? 'corta';

  const soloFecha = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  let instante: Date | null;
  let zonaUsada = zona;
  if (soloFecha) {
    const [y, m, d] = fecha.split('-').map(Number);
    // Mediodía UTC: ninguna zona horaria cambia el día.
    instante = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
    zonaUsada = 'UTC';
  } else {
    instante = aInstante(fecha);
  }
  if (!instante) return '';

  if (estilo === 'hora') {
    if (soloFecha) return '';
    return espaciosNormales(
      new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: zonaUsada,
      }).format(instante),
    );
  }

  if (estilo === 'completa') {
    return new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: zonaUsada,
    }).format(instante);
  }

  const texto = normalizarFechaCorta(
    new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
      day: 'numeric',
      month: 'short',
      ...(estilo === 'dia-mes' ? {} : { year: 'numeric' }),
      timeZone: zonaUsada,
    }).format(instante),
  );

  if (opciones?.conHora && !soloFecha) {
    const hora = formatearFecha(instante, { zona: zonaUsada, estilo: 'hora' });
    return hora ? `${texto}, ${hora}` : texto;
  }
  return texto;
}

/** «20 nov 2026, 10:30 a. m.» en la zona de la agencia. */
export function formatearFechaHora(
  fecha: string | Date | number | null | undefined,
  opciones?: OpcionesFormatoFecha,
): string {
  return formatearFecha(fecha, { ...opciones, conHora: true });
}

/**
 * Formatea números de teléfono según el estándar de Colombia:
 * - Móviles (10 dígitos, empiezan por 3): «+57 300 123 4567» o «300 123 4567»
 * - Fijos (10 dígitos con indicativo nacional 601..608): «+57 (601) 234 5678»
 */
export function formatearTelefono(
  telefono: string | null | undefined,
  opciones?: OpcionesFormatoTelefono,
): string {
  if (!telefono) return '';

  const incluirPais = opciones?.incluirCodigoPais ?? true;
  const soloDigitos = telefono.replace(/\D/g, '');

  let digitos = soloDigitos;
  if (digitos.startsWith('57') && digitos.length === 12) {
    digitos = digitos.slice(2);
  }

  // Móvil colombiano (10 dígitos comenzando con 3)
  if (digitos.length === 10 && digitos.startsWith('3')) {
    const p1 = digitos.slice(0, 3);
    const p2 = digitos.slice(3, 6);
    const p3 = digitos.slice(6);
    return incluirPais ? `+57 ${p1} ${p2} ${p3}` : `${p1} ${p2} ${p3}`;
  }

  // Fijo nacional colombiano (10 dígitos comenzando con 60)
  if (digitos.length === 10 && digitos.startsWith('60')) {
    const ind = digitos.slice(0, 3);
    const p1 = digitos.slice(3, 6);
    const p2 = digitos.slice(6);
    return incluirPais ? `+57 (${ind}) ${p1} ${p2}` : `(${ind}) ${p1} ${p2}`;
  }

  // Si no coincide con un número de 10 dígitos colombiano, preservar el valor limpio
  return telefono.trim();
}

/**
 * Enmascara un número telefónico ocultando los dígitos intermedios y dejando visibles
 * el indicativo de país/operador inicial y los últimos 4 dígitos (R10, T-099).
 * Ejemplo: "+573001234567" -> "+57 300 *** 4567"
 */
export function enmascararTelefono(telefono: string | null | undefined): string {
  if (!telefono) return '';
  const limpio = telefono.trim();
  if (!limpio) return '';

  const soloDigitos = limpio.replace(/\D/g, '');
  if (soloDigitos.length <= 4) {
    return `***${soloDigitos.slice(-2)}`;
  }

  // Móvil colombiano de 10 dígitos con o sin prefijo 57
  let digitosCol = soloDigitos;
  if (digitosCol.startsWith('57') && digitosCol.length === 12) {
    digitosCol = digitosCol.slice(2);
  }
  if (digitosCol.length === 10 && digitosCol.startsWith('3')) {
    const prefijo = digitosCol.slice(0, 3);
    const ultimos4 = digitosCol.slice(-4);
    return `+57 ${prefijo} *** ${ultimos4}`;
  }

  // Internacional o fijo: conservar últimos 4 dígitos
  const ultimos4 = soloDigitos.slice(-4);
  if (limpio.startsWith('+')) {
    const prefijoPais = soloDigitos.slice(0, Math.min(2, soloDigitos.length - 4));
    return `+${prefijoPais} *** ${ultimos4}`;
  }
  return `*** ${ultimos4}`;
}

/**
 * Roles operativos o de solo lectura que no requieren ver el teléfono completo del viajero
 * en listados generales (T-099).
 */
const ROLES_CON_TELEFONO_ENMASCARADO = new Set([
  'OPERACIONES',
  'SOLO_LECTURA',
  'CONTABILIDAD',
  'AUDITOR',
]);

/**
 * Devuelve el teléfono completo formateado para roles comerciales/administrativos (`DUENO`, `ASESOR`),
 * o enmascarado cuando el rol activo no necesita ver el número completo (`OPERACIONES`, `SOLO_LECTURA`).
 */
export function formatearTelefonoSegunRol(
  telefono: string | null | undefined,
  rol?: string | null,
  opciones?: OpcionesFormatoTelefono,
): string {
  if (!telefono) return '';
  const rolNormalizado = rol?.trim().toUpperCase();
  if (rolNormalizado && ROLES_CON_TELEFONO_ENMASCARADO.has(rolNormalizado)) {
    return enmascararTelefono(telefono);
  }
  return formatearTelefono(telefono, opciones);
}

/**
 * Redacta teléfonos E.164, números de pasaporte/documento y fechas de nacimiento que pudieran
 * aparecer accidentalmente en mensajes de error o diagnóstico del cliente (R10, T-099).
 */
export function sanitizarPiiEnTexto(texto: string | null | undefined): string {
  if (!texto) return '';
  return (
    texto
      // Teléfonos E.164 (+573001234567) o móviles de 10 dígitos (3001234567)
      .replace(/\+[1-9]\d{6,10}(\d{4})\b/g, '+***$1')
      .replace(/\b(3\d{2})\d{3}(\d{4})\b/g, '$1***$2')
      // Pasaportes alfanuméricos (ej. PA1234567, AB9876543)
      .replace(/\b([A-Z]{2})\d{3,6}(\d{2})\b/g, '$1***$2')
  );
}

/**
 * Formato descriptivo de cupos por salida o excursión.
 */
export function formatearCupo(
  disponibles: number | null | undefined,
  total?: number | null,
): string {
  if (disponibles === null || disponibles === undefined) {
    return 'Cupos libres';
  }

  if (disponibles <= 0) {
    return 'Agotado';
  }

  if (typeof total === 'number' && total > 0) {
    return `${disponibles} de ${total} cupos`;
  }

  if (disponibles === 1) {
    return '1 cupo disponible';
  }

  return `${disponibles} cupos disponibles`;
}

/** `2026-12-15` -> `15/12/2026`. Cadena vacía si no es una fecha ISO. */
export function fechaIsoADiaMesAnio(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** `15/12/2026` -> `2026-12-15`. `null` si no es una fecha real (rechaza 31/02/2026). */
export function diaMesAnioAFechaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Concordancia de número: pluralizar(1, 'niño', 'niños') -> «1 niño»; con 2 -> «2 niños».
 */
export function pluralizar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
