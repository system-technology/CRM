/**
 * Eventos de dominio de `payments` (ADR-0034 §7). Lógica pura: arma el evento y lo valida con el
 * MISMO esquema que usará su consumidor (`@viajapro/contracts`, R3). **Solo identificadores**: ni
 * monto, ni nota, ni referencia, ni motivo, ni nombres.
 */
import {
  PagoRegistradoV1,
  PagoReversadoV1,
  TIPO_PAGO_REGISTRADO,
  TIPO_PAGO_REVERSADO,
} from '@viajapro/contracts';

export interface EventoParaOutbox {
  agregado: string;
  agregadoId: string;
  tipoEvento: string;
  versionEvento: number;
  payload: PagoRegistradoV1 | PagoReversadoV1;
}

export function pagoRegistrado(e: {
  pagoId: string;
  travelFileId: string;
  tipo: 'PAGO' | 'DEVOLUCION' | 'AJUSTE' | 'PENALIDAD';
}): EventoParaOutbox {
  return {
    agregado: 'pago',
    agregadoId: e.pagoId,
    tipoEvento: TIPO_PAGO_REGISTRADO,
    versionEvento: 1,
    payload: PagoRegistradoV1.parse({
      v: 1,
      pagoId: e.pagoId,
      travelFileId: e.travelFileId,
      tipo: e.tipo,
    }),
  };
}

export function pagoReversado(e: {
  pagoId: string;
  reversoDeId: string;
  travelFileId: string;
}): EventoParaOutbox {
  return {
    agregado: 'pago',
    agregadoId: e.pagoId,
    tipoEvento: TIPO_PAGO_REVERSADO,
    versionEvento: 1,
    payload: PagoReversadoV1.parse({
      v: 1,
      pagoId: e.pagoId,
      reversoDeId: e.reversoDeId,
      travelFileId: e.travelFileId,
    }),
  };
}
