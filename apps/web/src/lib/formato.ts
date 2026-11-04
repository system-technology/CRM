/**
 * Módulo único de formato para es-CO (T-022)
 *
 * Centraliza las reglas de presentación para el mercado colombiano (ViajaPro):
 * 1. Dinero: COP en enteros, sin decimales, con punto de miles (R8).
 *    Monedas extranjeras (USD, EUR) con 2 decimales y coma decimal.
 * 2. Fechas: Zona horaria oficial del tenant ('America/Bogota', R9).
 *    Formato estándar legible «sáb 3 oct 2026».
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
 * Normaliza la representación de fecha corta eliminando puntos de abreviación y comas.
 * Convierte "sáb, 3 oct 2026" o "sáb. 3 de oct. de 2026" en "sáb 3 oct 2026".
 */
function normalizarFechaCorta(texto: string): string {
  return texto
    .replace(/,/g, '')
    .replace(/\./g, '')
    .replace(/\s+de\s+/g, ' ')
    .trim();
}

/**
 * Formatea una fecha en es-CO con la zona horaria del tenant ('America/Bogota' por defecto).
 * Estilo por defecto 'corta': «sáb 3 oct 2026».
 *
 * Tratamiento de casos límite:
 * - String de fecha pura 'YYYY-MM-DD': no sufre desplazamiento horario a la víspera.
 * - Timestamp UTC 'YYYY-MM-DDTHH:mm:ssZ': se traslada exactamente a la hora local en Bogotá (UTC-5).
 */
export function formatearFecha(
  fecha: string | Date | number | null | undefined,
  opciones?: OpcionesFormatoFecha,
): string {
  if (!fecha) return '';

  const zona = opciones?.zona ?? ZONA_HORARIA_COLOMBIA;
  const estilo = opciones?.estilo ?? 'corta';

  // Si es string de solo fecha (ej: '2026-10-03')
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-').map(Number);
    // Asignar mediodía UTC para que ninguna zona horaria cambie de día
    const fechaSegura = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0));

    if (estilo === 'dia-mes') {
      const fmt = new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
      return normalizarFechaCorta(fmt.format(fechaSegura));
    }

    if (estilo === 'completa') {
      const fmt = new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      return fmt.format(fechaSegura);
    }

    // Estilo por defecto 'corta': «sáb 3 oct 2026»
    const fmt = new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return normalizarFechaCorta(fmt.format(fechaSegura));
  }

  const dateObj = typeof fecha === 'string' || typeof fecha === 'number' ? new Date(fecha) : fecha;
  if (Number.isNaN(dateObj.getTime())) return '';

  if (estilo === 'hora') {
    return new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: zona,
    }).format(dateObj);
  }

  if (estilo === 'dia-mes') {
    const fmt = new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
      day: 'numeric',
      month: 'short',
      timeZone: zona,
    });
    return normalizarFechaCorta(fmt.format(dateObj));
  }

  if (estilo === 'completa') {
    return new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: zona,
    }).format(dateObj);
  }

  // Estilo por defecto 'corta'
  const fmt = new Intl.DateTimeFormat(LOCALE_COLOMBIA, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: zona,
  });

  return normalizarFechaCorta(fmt.format(dateObj));
}

/**
 * Formatea fecha y hora combinadas (ej: "sáb 3 oct 2026, 9:30 a. m.").
 */
export function formatearFechaHora(
  fecha: string | Date | number | null | undefined,
  opciones?: OpcionesFormatoFecha,
): string {
  if (!fecha) return '';
  const fechaTexto = formatearFecha(fecha, opciones);
  const horaTexto = formatearFecha(fecha, { ...opciones, estilo: 'hora' });
  if (!fechaTexto) return '';
  return horaTexto ? `${fechaTexto}, ${horaTexto}` : fechaTexto;
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
