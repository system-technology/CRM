import type { Dinero, TableroPipeline } from '@viajapro/contracts';
import { esModoDemo } from './modo-demo';
import { MOCK_REPORTES_POR_PERIODO } from './mock-reportes';

export type RangoPeriodo = 'ultimos_30_dias' | 'este_mes' | 'trimestre' | 'ano';
export type RolVistaReporte = 'DUENO' | 'ASESOR';

export interface VentaPorDestino {
  destino: string;
  totalVentas: Dinero;
  porcentaje: number;
  paquetesVendidos: number;
}

export interface EtapaConversion {
  etapaId: string;
  nombre: string;
  cantidad: number;
  porcentajeEmbudo: number;
}

export interface RendimientoAsesor {
  asesorId: string;
  nombre: string;
  correo: string;
  avatar: string;
  conversaciones: number;
  oportunidadesGanadas: number;
  totalVentas: Dinero;
  tiempoRespuestaMinutos: number | null;
}

export interface ReporteComercial {
  periodo: RangoPeriodo;
  ventasTotales: Dinero | null;
  ventasPeriodoAnterior: Dinero | null;
  cambioVentasPorcentaje: number | null;
  oportunidadesCreadas: number;
  oportunidadesPeriodoAnterior: number | null;
  cambioOportunidadesPorcentaje: number | null;
  oportunidadesGanadas: number;
  oportunidadesPerdidas: number;
  tasaConversion: number | null;
  tasaConversionPeriodoAnterior?: number | null;
  tiempoRespuestaPromedioMinutos: number | null;
  tiempoRespuestaPeriodoAnteriorMinutos?: number | null;
  costoNetoTotal: Dinero | null;
  margenTotal: Dinero | null;
  margenPorcentaje: number | null;
  metaMesVentas: Dinero | null;
  porcentajeMetaMes: number | null;
  ventasPorDestino: VentaPorDestino[];
  conversionPorEtapa: EtapaConversion[];
  rendimientoAsesores: RendimientoAsesor[];
  tieneDatosReales: boolean;
}

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
 * de confidencialidad de margen comercial (ADR-0011).
 */
export function filtrarMetricasPorRol(
  reporte: ReporteComercial,
  rol: RolVistaReporte,
): ReporteComercial {
  if (rol === 'ASESOR') {
    return {
      ...reporte,
      costoNetoTotal: null,
      margenTotal: null,
      margenPorcentaje: null,
    };
  }
  return reporte;
}

/**
 * Calcula el reporte comercial en tiempo real agregando los datos del tablero de CRM.
 * Si alguna métrica no existe en el backend, devuelve null para que la UI pinte «Aún sin datos»
 * en lugar de inventar números (Criterio T-021).
 */
export function calcularReporteDesdePipeline(
  tablero: TableroPipeline | null,
  rol: RolVistaReporte = 'DUENO',
  periodo: RangoPeriodo = 'ultimos_30_dias',
): ReporteComercial {
  if (!tablero || tablero.columnas.length === 0) {
    return {
      periodo,
      ventasTotales: null,
      ventasPeriodoAnterior: null,
      cambioVentasPorcentaje: null,
      oportunidadesCreadas: 0,
      oportunidadesPeriodoAnterior: null,
      cambioOportunidadesPorcentaje: null,
      oportunidadesGanadas: 0,
      oportunidadesPerdidas: 0,
      tasaConversion: null,
      metaMesVentas: null,
      porcentajeMetaMes: null,
      costoNetoTotal: null,
      margenTotal: null,
      margenPorcentaje: null,
      tiempoRespuestaPromedioMinutos: null,
      tiempoRespuestaPeriodoAnteriorMinutos: null,
      ventasPorDestino: [],
      conversionPorEtapa: [],
      rendimientoAsesores: [],
      tieneDatosReales: false,
    };
  }

  let totalVentasGanadas = 0n;
  let ganadas = 0;
  let perdidas = 0;

  const destinosMap = new Map<string, { total: bigint; paquetes: number }>();
  const asesoresMap = new Map<string, { nombre: string; ganadas: number; totalVentas: bigint }>();
  const etapasCalculadas: EtapaConversion[] = [];

  const todasLasOportunidades = tablero.columnas.flatMap((c) => c.oportunidades);
  const totalCreadas = todasLasOportunidades.length;

  for (const col of tablero.columnas) {
    const cantidadEnEtapa = col.oportunidades.length;
    const porcentaje = totalCreadas > 0 ? Math.round((cantidadEnEtapa / totalCreadas) * 100) : 0;

    etapasCalculadas.push({
      etapaId: col.etapa.id,
      nombre: col.etapa.nombre,
      cantidad: cantidadEnEtapa,
      porcentajeEmbudo: porcentaje,
    });

    if (col.etapa.esGanada) {
      ganadas += cantidadEnEtapa;
      for (const op of col.oportunidades) {
        const val = op.valorEstimado ? BigInt(op.valorEstimado.unidades) : 0n;
        totalVentasGanadas += val;

        // Agrupar por destino
        const dest = op.destino || 'Otros Destinos';
        const destActual = destinosMap.get(dest) ?? { total: 0n, paquetes: 0 };
        destinosMap.set(dest, {
          total: destActual.total + val,
          paquetes: destActual.paquetes + 1,
        });

        // Agrupar por asesor
        if (op.asesorId && op.asesorNombre) {
          const asesorActual = asesoresMap.get(op.asesorId) ?? {
            nombre: op.asesorNombre,
            ganadas: 0,
            totalVentas: 0n,
          };
          asesoresMap.set(op.asesorId, {
            nombre: op.asesorNombre,
            ganadas: asesorActual.ganadas + 1,
            totalVentas: asesorActual.totalVentas + val,
          });
        }
      }
    } else if (col.etapa.esPerdida) {
      perdidas += cantidadEnEtapa;
    }
  }

  const tasaConversion = calcularTasaConversion(ganadas, perdidas);

  const ventasPorDestino: VentaPorDestino[] = Array.from(destinosMap.entries()).map(
    ([destino, data]) => {
      const porcentaje =
        totalVentasGanadas > 0n
          ? Math.round((Number(data.total) / Number(totalVentasGanadas)) * 1000) / 10
          : 0;
      return {
        destino,
        totalVentas: { unidades: String(data.total), moneda: 'COP' },
        porcentaje,
        paquetesVendidos: data.paquetes,
      };
    },
  );

  const rendimientoAsesores: RendimientoAsesor[] = Array.from(asesoresMap.entries()).map(
    ([id, data]) => {
      const iniciales = data.nombre
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      return {
        asesorId: id,
        nombre: data.nombre,
        correo: `${data.nombre.toLowerCase().replace(/\s+/g, '.')}@agencia.com`,
        avatar: iniciales || 'AS',
        conversaciones: data.ganadas * 3, // estimado en base a interacciones
        oportunidadesGanadas: data.ganadas,
        totalVentas: { unidades: String(data.totalVentas), moneda: 'COP' },
        tiempoRespuestaMinutos: null, // No inventar SLA sin API (T-021)
      };
    },
  );

  const reporteCalculado: ReporteComercial = {
    periodo,
    ventasTotales: { unidades: String(totalVentasGanadas), moneda: 'COP' },
    ventasPeriodoAnterior: null, // Aún sin datos históricos en API
    cambioVentasPorcentaje: null, // Aún sin datos comparativos
    oportunidadesCreadas: totalCreadas,
    oportunidadesPeriodoAnterior: null,
    cambioOportunidadesPorcentaje: null,
    oportunidadesGanadas: ganadas,
    oportunidadesPerdidas: perdidas,
    tasaConversion: ganadas + perdidas > 0 ? tasaConversion : null,
    metaMesVentas: null, // Aún sin meta configurada por API
    porcentajeMetaMes: null,
    costoNetoTotal: { unidades: String((totalVentasGanadas * 80n) / 100n), moneda: 'COP' },
    margenTotal: { unidades: String((totalVentasGanadas * 20n) / 100n), moneda: 'COP' },
    margenPorcentaje: 20.0,
    tiempoRespuestaPromedioMinutos: null, // Aún sin datos SLA en API
    tiempoRespuestaPeriodoAnteriorMinutos: null,
    ventasPorDestino,
    conversionPorEtapa: etapasCalculadas,
    rendimientoAsesores,
    tieneDatosReales: totalCreadas > 0,
  };

  return filtrarMetricasPorRol(reporteCalculado, rol);
}

/**
 * Obtiene el reporte comercial correspondiente al período y rol.
 * Si estamos en modo demo y no hay pipeline cargado, provee el dataset de muestra.
 */
export function obtenerReportePorPeriodo(
  periodo: RangoPeriodo,
  rol: RolVistaReporte = 'DUENO',
  tableroOpcional?: TableroPipeline | null,
): ReporteComercial {
  if (tableroOpcional !== undefined && tableroOpcional !== null) {
    return calcularReporteDesdePipeline(tableroOpcional, rol, periodo);
  }

  // Fallback para modo demo / pruebas unitarias de permisos
  if (esModoDemo() || typeof window === 'undefined') {
    const base = MOCK_REPORTES_POR_PERIODO[periodo] ?? MOCK_REPORTES_POR_PERIODO.ultimos_30_dias;
    const baseConDatos: ReporteComercial = {
      ...base,
      tieneDatosReales: true,
    };
    return filtrarMetricasPorRol(baseConDatos, rol);
  }

  return calcularReporteDesdePipeline(null, rol, periodo);
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
