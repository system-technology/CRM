/**
 * Historial de cambios de precio de una tarifa (ADR-0017 §8, T-047).
 *
 * Se LEE de `registros_auditoria`; no existe otra tabla. Más reciente primero, paginado por cursor
 * (el id de la fila, monótono). Sin `cotizacion.ver_neto_y_margen`, las entradas de `neto` salen sin
 * `antes` ni `despues`. Una tarifa que no existe ni deja rastro en esta agencia es 404: RLS hace
 * que una tarifa ajena sea indistinguible de una inexistente.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { CambioDePrecio, HistorialDePrecios } from '@viajapro/contracts';
import { TarifaNoEncontradaError } from '../domain/errores-de-gestion.js';
import { type FilaDeHistorial, LectorDeHistorial } from './puertos-de-historial.js';

const MONEDAS = ['COP', 'USD', 'EUR', 'MXN'] as const;
const ORIGENES = ['PANTALLA', 'ARCHIVO', 'API', 'IA'] as const;
const CAMPOS = ['venta', 'neto', 'lista', 'promo_hasta'] as const;

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const uno = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  lista.find((x) => x === v) ?? null;

function objeto(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Una fila de auditoría produce cero o una entrada; las que no son de precio se descartan. */
export function aEntrada(fila: FilaDeHistorial, puedeVerNeto: boolean): CambioDePrecio | null {
  const d = objeto(fila.detalle);
  const base = {
    id: fila.id,
    instante: fila.ocurridoEn.toISOString(),
    usuarioId: fila.usuarioId,
    accion: fila.accion,
    moneda: uno(MONEDAS, d['moneda']),
    origen: uno(ORIGENES, d['origen']),
  };
  if (fila.accion === 'catalogo.tarifa.eliminada') {
    return { ...base, campo: 'venta', antes: texto(d['venta']), despues: null };
  }
  const campo = uno(CAMPOS, d['campo']);
  if (campo === null) return null;
  if (campo === 'neto' && !puedeVerNeto) return { ...base, campo };
  return { ...base, campo, antes: texto(d['antes']), despues: texto(d['despues']) };
}

@Injectable()
export class HistorialDePreciosUseCase {
  constructor(@Inject(LectorDeHistorial) private readonly lector: LectorDeHistorial) {}

  async ejecutar(
    tarifaId: string,
    consulta: { limite: number; cursor?: string | undefined },
    puedeVerNeto: boolean,
  ): Promise<HistorialDePrecios> {
    const pagina = await this.lector.leer(tarifaId, consulta.limite + 1, consulta.cursor);
    if (pagina === null) throw new TarifaNoEncontradaError(tarifaId);
    const hayMas = pagina.length > consulta.limite;
    const filas = pagina.slice(0, consulta.limite);
    const ultima = filas[filas.length - 1];
    return {
      datos: filas.flatMap((f) => aEntrada(f, puedeVerNeto) ?? []),
      siguienteCursor: hayMas && ultima ? ultima.id : null,
    };
  }
}
