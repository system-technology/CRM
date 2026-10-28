/**
 * El texto con que una versión de cotización sale por WhatsApp (T-073). Función pura: sin base, sin
 * red, sin reloj.
 *
 * Solo usa lo que ve el viajero: producto, fecha, pasajeros, líneas, total y vigencia. **Nunca**
 * neto, margen ni política (publicar el margen es publicar el neto). Dinero en enteros de la unidad
 * mínima (R8) formateado `es-CO`: separador de miles `.`, decimal `,`. Los cargos en destino van
 * aparte bajo «No incluido» y no suman al total.
 */
import type { CargoEnDestino, Dinero, VersionDeCotizacion } from '@viajapro/contracts';
import { InvariantError, MONEDAS, esCodigoMoneda } from '@viajapro/domain';

/** Tope de WhatsApp para un mensaje de texto, y de `EnviarTexto`. */
export const LIMITE_DE_TEXTO = 4096;

export class TextoDeCotizacionDemasiadoLargoError extends InvariantError {
  readonly code = 'TEXTO_DE_COTIZACION_DEMASIADO_LARGO';
  constructor(readonly largo: number) {
    super(
      `El texto de la cotización pesa ${largo} caracteres y WhatsApp admite ${LIMITE_DE_TEXTO}.`,
    );
  }
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const SIMBOLO: Record<string, string> = { COP: '$', USD: 'US$', EUR: '€', MXN: 'MX$' };

/** `2026-12-15` → `15 de diciembre de 2026`. Sin `Date`: una fecha de viaje no tiene huso (R9). */
export function fechaEnEspanol(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  const mes = MESES[Number(m) - 1];
  if (!a || !d || !mes) return iso;
  return `${Number(d)} de ${mes} de ${a}`;
}

/** `{ unidades: '1234567', moneda: 'COP' }` → `$ 1.234.567`; USD `US$ 1.234,56`. */
export function formatearDinero(dinero: Dinero): string {
  const moneda = dinero.moneda;
  const decimales = esCodigoMoneda(moneda) ? MONEDAS[moneda].decimales : 0;
  const valor = BigInt(dinero.unidades);
  const negativo = valor < 0n;
  const absoluto = (negativo ? -valor : valor).toString().padStart(decimales + 1, '0');
  const entera = decimales === 0 ? absoluto : absoluto.slice(0, -decimales);
  const fraccion = decimales === 0 ? '' : absoluto.slice(-decimales);
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${SIMBOLO[moneda] ?? moneda} ${miles}${fraccion ? `,${fraccion}` : ''}`;
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

function pasajeros(v: Pick<VersionDeCotizacion, 'adultos' | 'ninos' | 'infantes'>): string {
  const partes: string[] = [];
  if (v.adultos > 0) partes.push(plural(v.adultos, 'adulto', 'adultos'));
  if (v.ninos > 0) partes.push(plural(v.ninos, 'niño', 'niños'));
  if (v.infantes > 0) partes.push(plural(v.infantes, 'infante', 'infantes'));
  return partes.join(', ');
}

function cargo(c: CargoEnDestino): string {
  const monto = c.monto ? formatearDinero(c.monto) : 'monto por confirmar';
  const unidad = c.monto ? (c.unidad === 'POR_PERSONA' ? ' por persona' : ' por grupo') : '';
  return `• ${c.concepto}: ${monto}${unidad}${c.nota ? ` (${c.nota})` : ''}`;
}

export function textoDeCotizacionParaWhatsapp(
  v: VersionDeCotizacion,
  cargosEnDestino: readonly CargoEnDestino[],
): string {
  const noches = v.noches > 0 ? ` · ${plural(v.noches, 'noche', 'noches')}` : '';
  const filas = [
    `*Cotización: ${v.paqueteNombre}*`,
    `Destino: ${v.destino}${noches}`,
    `Fecha de salida: ${fechaEnEspanol(v.fechaSalida)}`,
    `Pasajeros: ${pasajeros(v)}`,
    '',
    '*Detalle*',
    ...v.lineas.map((l) => `• ${l.nombre} × ${l.veces}: ${formatearDinero(l.total)}`),
    '',
    `*Total: ${formatearDinero(v.venta)} ${v.venta.moneda}*`,
  ];
  if (v.vigenteHasta) filas.push(`Precio vigente hasta el ${fechaEnEspanol(v.vigenteHasta)}.`);
  if (cargosEnDestino.length > 0) {
    filas.push('', '*No incluido (se paga en destino)*', ...cargosEnDestino.map(cargo));
  }
  const texto = filas.join('\n');
  if (texto.length > LIMITE_DE_TEXTO) throw new TextoDeCotizacionDemasiadoLargoError(texto.length);
  return texto;
}
