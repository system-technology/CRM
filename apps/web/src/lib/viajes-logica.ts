/**
 * Lógica pura de cálculo, alertas operativas y protección PII para Archivos de Viaje (/viajes).
 *
 * Cero dependencias de framework o UI, testeable 100% en Vitest.
 */

import type { PasajeroViaje, ReservaProveedor } from './mock-viajes';

/**
 * Calcula el balance financiero del expediente operativo.
 * Regla R8: Todo en unidades enteras de COP sin decimales.
 */
export function calcularSaldoPendiente(
  totalVentaCop: number,
  totalPagadoCop: number,
): {
  saldoCop: number;
  porcentajePagado: number;
  estaPagadoTotal: boolean;
} {
  const saldo = Math.max(0, totalVentaCop - totalPagadoCop);
  const porcentaje =
    totalVentaCop > 0 ? Math.min(100, Math.round((totalPagadoCop / totalVentaCop) * 100)) : 100;

  return {
    saldoCop: saldo,
    porcentajePagado: porcentaje,
    estaPagadoTotal: saldo === 0,
  };
}

/**
 * Evalúa la urgencia del Time Limit de un proveedor (aerolínea, mayorista).
 *
 * Invariante de producto:
 * El time limit es el dato que más dinero cuesta cuando se olvida (lenguaje ubicuo).
 */
export function evaluarAlertaTimeLimit(
  timeLimitUtc: string,
  ahoraMs: number = Date.now(),
): {
  estado: 'VENCIDO' | 'CRITICO' | 'PROXIMO' | 'SEGURO';
  horasRestantes: number;
  mensaje: string;
} {
  const limiteMs = new Date(timeLimitUtc).getTime();
  const diffMs = limiteMs - ahoraMs;
  const horasRestantes = Math.round(diffMs / 3600000);

  if (diffMs <= 0) {
    return {
      estado: 'VENCIDO',
      horasRestantes: 0,
      mensaje: '¡Time limit vencido! Cupo en riesgo de liberación por el proveedor.',
    };
  }

  if (horasRestantes <= 24) {
    return {
      estado: 'CRITICO',
      horasRestantes,
      mensaje: `Vence en ${horasRestantes}h. Requiere pago o emisión inmediata.`,
    };
  }

  if (horasRestantes <= 72) {
    return {
      estado: 'PROXIMO',
      horasRestantes,
      mensaje: `Vence en ${Math.round(horasRestantes / 24)} días (${horasRestantes}h).`,
    };
  }

  return {
    estado: 'SEGURO',
    horasRestantes,
    mensaje: `Vigente hasta ${new Date(timeLimitUtc).toLocaleDateString('es-CO')}.`,
  };
}

/**
 * Enmascara datos personales sensibles de identificación de viajeros (R10).
 * Protege PII contra visualización indebida o capturas de pantalla involuntarias.
 */
export function enmascararDocumentoPii(documentoNumero: string, tipoDoc: string = 'CC'): string {
  const limpio = documentoNumero.trim();
  if (limpio.length <= 4) {
    return `${tipoDoc}-***${limpio.slice(-2)}`;
  }
  const visibles = limpio.slice(-4);
  return `${tipoDoc}-***${visibles}`;
}

/**
 * Verifica el estado de documentación de los pasajeros del viaje.
 */
export function verificarDocumentacionCompleta(pasajeros: PasajeroViaje[]): {
  completa: boolean;
  faltantes: number;
  porcentajeListos: number;
} {
  if (pasajeros.length === 0) {
    return { completa: true, faltantes: 0, porcentajeListos: 100 };
  }

  const listos = pasajeros.filter(
    (p) => p.estadoDocumentos === 'VERIFICADO' || p.estadoDocumentos === 'CARGADO',
  ).length;

  const faltantes = pasajeros.length - listos;
  const porcentaje = Math.round((listos / pasajeros.length) * 100);

  return {
    completa: faltantes === 0,
    faltantes,
    porcentajeListos: porcentaje,
  };
}

/**
 * Calcula el margen operativo del expediente (Venta total menos costos netos de reservas).
 */
export function calcularMargenOperativoExpediente(
  totalVentaCop: number,
  reservas: ReservaProveedor[],
): {
  costoTotalNetoCop: number;
  margenCop: number;
  porcentajeMargen: number;
} {
  const costoTotalNetoCop = reservas.reduce((acc, r) => acc + r.costoNetoCop, 0);
  const margenCop = Math.max(0, totalVentaCop - costoTotalNetoCop);
  const porcentajeMargen = totalVentaCop > 0 ? Math.round((margenCop / totalVentaCop) * 100) : 0;

  return {
    costoTotalNetoCop,
    margenCop,
    porcentajeMargen,
  };
}
