/**
 * Un movimiento del libro de cobro (`Payment`, ADR-0034 §2) tal como lo ve el dominio. Sin Prisma.
 */
import type { TipoDeMovimientoDeCobro } from '@viajapro/domain';

export interface Movimiento {
  id: string;
  travelFileId: string;
  tipo: TipoDeMovimientoDeCobro;
  /** Con signo: negativo solo en un AJUSTE (descuento) y en el REVERSO que lo copia. */
  montoUnidades: bigint;
  monedaIso: string;
  /** `AAAA-MM-DD`. Solo PAGO y DEVOLUCION. */
  pagadoEl: string | null;
  medio: string | null;
  pagadorId: string | null;
  referencia: string | null;
  nota: string | null;
  notaTachadaEn: Date | null;
  motivo: string | null;
  reversoDeId: string | null;
  claveIdempotencia: string;
  registradoPor: string;
  registradoEn: Date;
}

/** Lo que se inserta: la base fija `registrado_en` (el cliente nunca lo manda). */
export type MovimientoNuevo = Omit<Movimiento, 'registradoEn' | 'notaTachadaEn'>;

/**
 * El contenido que cuenta para decidir si un reintento con la misma clave es «el mismo»
 * (ADR-0034 §4 paso 2): tipo, archivo, monto, moneda, fecha, medio, pagador y `reverso_de_id`.
 */
export function mismoContenido(
  a: Pick<
    Movimiento,
    | 'tipo'
    | 'travelFileId'
    | 'montoUnidades'
    | 'monedaIso'
    | 'pagadoEl'
    | 'medio'
    | 'pagadorId'
    | 'reversoDeId'
  >,
  b: typeof a,
): boolean {
  // Los uuid se comparan sin distinguir mayúsculas: el contrato ya los normaliza, y esto lo sostiene
  // aunque otra vía no lo haga.
  const id = (v: string | null): string | null => (v === null ? null : v.toLowerCase());
  return (
    a.tipo === b.tipo &&
    id(a.travelFileId) === id(b.travelFileId) &&
    a.montoUnidades === b.montoUnidades &&
    a.monedaIso === b.monedaIso &&
    a.pagadoEl === b.pagadoEl &&
    a.medio === b.medio &&
    id(a.pagadorId) === id(b.pagadorId) &&
    id(a.reversoDeId) === id(b.reversoDeId)
  );
}
