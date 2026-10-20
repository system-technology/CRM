import type { Dinero } from '@viajapro/contracts';
import type { RangoPeriodo, ReporteComercial, RolVistaReporte } from './mock-reportes';
import { MOCK_REPORTES_POR_PERIODO } from './mock-reportes';

/**
 * Calcula la tasa de conversión porcentual (ganadas / cerradas).
 * Protegido contra división por cero.
 */
export function calcularTasaConversion(ganadas: number, perdidas: number): number {
  const cerradas = ganadas + perdidas;
  if (cerradas <= 0) return 0;
  return Math.round((ganadas / cerradas) * 1000) / 10;
}

/**
 * Calcula la variación porcentual entre dos cantidades consecutivas.
 * Retorna el delta con 1 decimal de precisión (+16.5, -4.2, etc.).
 */
export function calcularVariacionPorcentual(
  actual: number | bigint,
  anterior: number | bigint,
): number {
  const vActual = typeof actual === 'bigint' ? Number(actual) : actual;
  const vAnterior = typeof anterior === 'bigint' ? Number(anterior) : anterior;

  if (vAnterior === 0) {
    return vActual > 0 ? 100 : 0;
  }

  const delta = ((vActual - vAnterior) / vAnterior) * 100;
  return Math.round(delta * 10) / 10;
}

/**
 * Calcula el margen bruto y porcentaje sobre ventas garantizando operaciones
 * R8 en enteros (centavos o pesos) con BigInt.
 */
export function calcularMargenReporte(
  venta: Dinero,
  neto: Dinero,
): { margen: Dinero; porcentaje: number } {
  const uVenta = BigInt(venta.unidades);
  const uNeto = BigInt(neto.unidades);
  const uMargen = uVenta - uNeto;

  const porcentaje = uVenta > 0n ? Math.round((Number(uMargen) / Number(uVenta)) * 1000) / 10 : 0;

  return {
    margen: {
      unidades: String(uMargen),
      moneda: venta.moneda,
    },
    porcentaje,
  };
}

/**
 * Filtra el reporte según el rol del usuario para cumplir con las reglas de negocio
 * de viajapro_diseno_ui_ux.json:
 * "Separar vista operativa del asesor y vista gerencial del dueño.
 *  No mostrar margen como dato fiable si faltan costos netos o a roles operativos."
 */
export function filtrarMetricasPorRol(
  reporte: ReporteComercial,
  rol: RolVistaReporte,
): ReporteComercial {
  if (rol === 'ASESOR') {
    return {
      ...reporte,
      costoNetoTotal: { unidades: '0', moneda: reporte.ventasTotales.moneda },
      margenTotal: { unidades: '0', moneda: reporte.ventasTotales.moneda },
      margenPorcentaje: 0,
    };
  }
  return reporte;
}

/**
 * Obtiene el reporte comercial correspondiente al período seleccionado.
 */
export function obtenerReportePorPeriodo(
  periodo: RangoPeriodo,
  rol: RolVistaReporte = 'DUENO',
): ReporteComercial {
  const base = MOCK_REPORTES_POR_PERIODO[periodo] ?? MOCK_REPORTES_POR_PERIODO.ultimos_30_dias;
  return filtrarMetricasPorRol(base, rol);
}

/**
 * Retorna la etiqueta legible del período.
 */
export function obtenerEtiquetaPeriodo(periodo: RangoPeriodo): string {
  switch (periodo) {
    case 'ultimos_30_dias':
      return 'Últimos 30 días';
    case 'este_mes':
      return 'Este mes';
    case 'trimestre':
      return 'Último trimestre';
    case 'ano':
      return 'Año completo';
  }
}
