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
 * Lo que el cliente mandó y quedó guardado. Es **todo** lo que viaja en el cuerpo: no solo el
 * dinero, también el texto libre (`referencia`, `nota`, `motivo`).
 */
export type ContenidoDeMovimiento = Pick<
  Movimiento,
  | 'tipo'
  | 'travelFileId'
  | 'montoUnidades'
  | 'monedaIso'
  | 'pagadoEl'
  | 'medio'
  | 'pagadorId'
  | 'reversoDeId'
  | 'referencia'
  | 'nota'
  | 'motivo'
>;

/**
 * ¿El reintento con la misma clave es «el mismo» movimiento? (ADR-0034 §4 paso 2, enmendado por
 * ADR-0036.) Se compara **todo el contenido**, texto libre incluido.
 *
 * Hasta T-516 solo se comparaba el dinero: una asesora que reintentaba con la nota o la referencia
 * corregidas recibía un 200 con la fila original y su corrección se descartaba sin decírselo. Y no
 * podía deshacerla: corregir el libro es del dueño (`cobro.corregir`, ADR-0034 §2). Ahora eso es un
 * 409 tipado.
 *
 * El texto llega ya recortado por el contrato (`.trim().min(1)`), así que se compara tal cual;
 * «ausente» es `null` en los dos lados.
 */
export function mismoContenido(
  existente: ContenidoDeMovimiento & Pick<Movimiento, 'notaTachadaEn'>,
  candidato: ContenidoDeMovimiento,
): boolean {
  // Los uuid se comparan sin distinguir mayúsculas: el contrato ya los normaliza, y esto lo sostiene
  // aunque otra vía no lo haga.
  const id = (v: string | null): string | null => (v === null ? null : v.toLowerCase());
  // Tachada (ADR-0034 §2.4): la base vació `nota` y `referencia` a propósito. Compararlas le daría
  // un 409 a un reintento honesto por algo que el cliente no hizo, así que ahí no cuentan.
  const mismoTextoLibre =
    existente.notaTachadaEn !== null ||
    (existente.referencia === candidato.referencia && existente.nota === candidato.nota);
  return (
    existente.tipo === candidato.tipo &&
    id(existente.travelFileId) === id(candidato.travelFileId) &&
    existente.montoUnidades === candidato.montoUnidades &&
    existente.monedaIso === candidato.monedaIso &&
    existente.pagadoEl === candidato.pagadoEl &&
    existente.medio === candidato.medio &&
    id(existente.pagadorId) === id(candidato.pagadorId) &&
    id(existente.reversoDeId) === id(candidato.reversoDeId) &&
    existente.motivo === candidato.motivo &&
    mismoTextoLibre
  );
}
