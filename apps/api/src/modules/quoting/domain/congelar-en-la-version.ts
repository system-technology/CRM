/**
 * Lo que se congela en la versión además de los importes (ADR-0024 §2): el mayorista de cada línea
 * y la TRM. Lógica pura: el mayorista de cada tarifa y la moneda de la agencia las lee quien llama.
 *
 * **No se inventa nada.** Una tarifa sin mayorista conocido congela `null` (la reserva nace «por
 * definir»), y una versión sin TRM declarada queda sin TRM aunque su moneda no sea la de la agencia.
 */
import type { CotizacionDeSalida, FuenteDeTrm, TrmDeEntrada } from '@viajapro/contracts';
import { TrmInnecesariaError } from './errors.js';

/** Una línea congelada: la línea calculada más el mayorista del que sale. Solo se persiste. */
export type LineaCongelada = CotizacionDeSalida['lineas'][number] & {
  mayoristaId: string | null;
};

export function congelarMayoristaPorLinea(
  lineas: CotizacionDeSalida['lineas'],
  mayoristaPorTarifa: ReadonlyMap<string, string | null>,
): LineaCongelada[] {
  return lineas.map((l) => ({ ...l, mayoristaId: mayoristaPorTarifa.get(l.tarifaId) ?? null }));
}

export interface TrmCongelada {
  monedaOrigen: string;
  monedaDestino: string;
  /** Decimal exacto en texto, con 6 decimales (`numeric(18,6)`). */
  valor: string;
  /** `AAAA-MM-DD`. */
  fecha: string;
  fuente: FuenteDeTrm;
}

/** Normaliza a exactamente 6 decimales sin pasar por `number`. */
function aSeisDecimales(valor: string): string {
  const [entera = '0', fraccion = ''] = valor.split('.');
  return `${entera.replace(/^0+(?=\d)/, '')}.${fraccion.padEnd(6, '0')}`;
}

export function congelarTrm(
  monedaDeLaVersion: string,
  monedaDeLaAgencia: string,
  entrada: TrmDeEntrada | undefined,
): TrmCongelada | null {
  if (!entrada) return null;
  if (monedaDeLaVersion === monedaDeLaAgencia) throw new TrmInnecesariaError(monedaDeLaAgencia);
  return {
    monedaOrigen: monedaDeLaVersion,
    monedaDestino: monedaDeLaAgencia,
    valor: aSeisDecimales(entrada.valor),
    fecha: entrada.fecha,
    fuente: entrada.fuente,
  };
}
