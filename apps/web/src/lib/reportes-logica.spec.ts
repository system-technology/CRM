import { describe, expect, it } from 'vitest';
import type { TableroPipeline } from '@viajapro/contracts';
import {
  calcularMargenReporte,
  calcularReporteDesdePipeline,
  calcularTasaConversion,
  calcularVariacionPorcentual,
  filtrarMetricasPorRol,
  obtenerEtiquetaPeriodo,
  obtenerReportePorPeriodo,
  type ReporteComercial,
} from './reportes-logica';

describe('Pruebas del Módulo de Reportes, Métricas y Cierres (Screen 4)', () => {
  it('1. calcularTasaConversion calcula el porcentaje de éxito y es seguro ante cero', () => {
    // 18 ganadas y 6 perdidas = 18 / 24 = 75.0%
    expect(calcularTasaConversion(18, 6)).toBe(75.0);

    // 0 ganadas y 0 perdidas no lanza excepción ni NaN
    expect(calcularTasaConversion(0, 0)).toBe(0);

    // Solo ganadas
    expect(calcularTasaConversion(5, 0)).toBe(100.0);
  });

  it('2. calcularVariacionPorcentual calcula deltas positivos y negativos con 1 decimal', () => {
    // De 42.2M a 48.95M
    const delta = calcularVariacionPorcentual(48950000, 42200000);
    expect(delta).toBe(16.0);

    // Caída
    const deltaNegativo = calcularVariacionPorcentual(80, 100);
    expect(deltaNegativo).toBe(-20.0);

    // Base cero
    expect(calcularVariacionPorcentual(50, 0)).toBe(100.0);
    expect(calcularVariacionPorcentual(0, 0)).toBe(0);
  });

  it('3. calcularMargenReporte calcula margen y porcentaje usando BigInt sin redondeos engañosos (R8)', () => {
    const venta = { unidades: '50000000', moneda: 'COP' as const };
    const neto = { unidades: '40000000', moneda: 'COP' as const };

    const resultado = calcularMargenReporte(venta, neto);
    expect(resultado.margen.unidades).toBe('10000000');
    expect(resultado.margen.moneda).toBe('COP');
    expect(resultado.porcentaje).toBe(20.0);
  });

  it('4. filtrarMetricasPorRol oculta márgenes a la vista de asesor y los mantiene para el dueño', () => {
    const reporteBase: ReporteComercial = {
      periodo: 'ultimos_30_dias',
      ventasTotales: { unidades: '50000000', moneda: 'COP' },
      ventasPeriodoAnterior: null,
      cambioVentasPorcentaje: null,
      oportunidadesCreadas: 10,
      oportunidadesPeriodoAnterior: null,
      cambioOportunidadesPorcentaje: null,
      oportunidadesGanadas: 5,
      oportunidadesPerdidas: 2,
      tasaConversion: 71.4,
      tiempoRespuestaPromedioMinutos: null,
      costoNetoTotal: { unidades: '40000000', moneda: 'COP' },
      margenTotal: { unidades: '10000000', moneda: 'COP' },
      margenPorcentaje: 20.0,
      metaMesVentas: null,
      porcentajeMetaMes: null,
      ventasPorDestino: [],
      conversionPorEtapa: [],
      rendimientoAsesores: [],
      tieneDatosReales: true,
    };

    expect(Number(reporteBase.margenTotal?.unidades)).toBeGreaterThan(0);
    expect(reporteBase.margenPorcentaje).toBeGreaterThan(0);

    const reporteAsesor = filtrarMetricasPorRol(reporteBase, 'ASESOR');
    expect(reporteAsesor.margenTotal).toBeNull();
    expect(reporteAsesor.costoNetoTotal).toBeNull();
    expect(reporteAsesor.margenPorcentaje).toBeNull();

    // Mantiene métricas operativas intactas
    expect(reporteAsesor.oportunidadesCreadas).toBe(reporteBase.oportunidadesCreadas);
    expect(reporteAsesor.tasaConversion).toBe(reporteBase.tasaConversion);
    expect(reporteAsesor.ventasTotales?.unidades).toBe('50000000');
  });

  it('5. calcularReporteDesdePipeline entrega «Aún sin datos» (null) cuando el tablero está vacío o ausente', () => {
    const reporteVacio = calcularReporteDesdePipeline(null, 'DUENO', 'ultimos_30_dias');

    expect(reporteVacio.tieneDatosReales).toBe(false);
    expect(reporteVacio.ventasTotales).toBeNull();
    expect(reporteVacio.ventasPeriodoAnterior).toBeNull();
    expect(reporteVacio.cambioVentasPorcentaje).toBeNull();
    expect(reporteVacio.oportunidadesCreadas).toBe(0);
    expect(reporteVacio.tasaConversion).toBeNull();
    expect(reporteVacio.metaMesVentas).toBeNull();
    expect(reporteVacio.tiempoRespuestaPromedioMinutos).toBeNull();
    expect(reporteVacio.ventasPorDestino).toHaveLength(0);
    expect(reporteVacio.conversionPorEtapa).toHaveLength(0);
    expect(reporteVacio.rendimientoAsesores).toHaveLength(0);
  });

  it('6. calcularReporteDesdePipeline calcula métricas reales sin inventar SLA ni comparativos históricos', () => {
    const etapaInicial = {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
      clave: 'NUEVO_LEAD' as const,
      nombre: 'Contacto Inicial',
      esGanada: false,
      esPerdida: false,
      orden: 0,
      probabilidad: 10,
    };
    const etapaGanada = {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
      clave: 'GANADA' as const,
      nombre: 'Ganada',
      esGanada: true,
      esPerdida: false,
      orden: 1,
      probabilidad: 100,
    };
    const etapaPerdida = {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a03',
      clave: 'PERDIDA' as const,
      nombre: 'Perdida',
      esGanada: false,
      esPerdida: true,
      orden: 2,
      probabilidad: 0,
    };

    const tableroMock: TableroPipeline = {
      columnas: [
        {
          etapa: etapaInicial,
          total: 1,
          valorTotal: { unidades: '6000000', moneda: 'COP' },
          oportunidades: [
            {
              id: '00000000-0010-4000-8000-000000000001',
              titulo: 'Luna de miel Cartagena',
              contactoId: '00000000-0002-4000-8000-000000000001',
              contactoNombre: 'Laura Gómez',
              etapa: etapaInicial,
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              valorEstimado: { unidades: '6000000', moneda: 'COP' },
              probabilidad: 10,
              destino: 'Cartagena',
              asesorId: null,
              asesorNombre: null,
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-20T10:00:00Z',
            },
          ],
        },
        {
          etapa: etapaGanada,
          total: 2,
          valorTotal: { unidades: '12000000', moneda: 'COP' },
          oportunidades: [
            {
              id: '00000000-0010-4000-8000-000000000002',
              titulo: 'Excursión Barú VIP',
              contactoId: '00000000-0002-4000-8000-000000000002',
              contactoNombre: 'Carlos Ruiz',
              etapa: etapaGanada,
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              valorEstimado: { unidades: '4000000', moneda: 'COP' },
              probabilidad: 100,
              destino: 'Cartagena',
              asesorId: '00000000-0000-4000-a000-000000000001',
              asesorNombre: 'Mariana Pérez',
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-21T10:00:00Z',
            },
            {
              id: '00000000-0010-4000-8000-000000000003',
              titulo: 'Tour Eje Cafetero',
              contactoId: '00000000-0002-4000-8000-000000000003',
              contactoNombre: 'Sofia Duque',
              etapa: etapaGanada,
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              valorEstimado: { unidades: '8000000', moneda: 'COP' },
              probabilidad: 100,
              destino: 'Eje Cafetero',
              asesorId: '00000000-0000-4000-a000-000000000002',
              asesorNombre: 'Andrés Morales',
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-22T10:00:00Z',
            },
          ],
        },
        {
          etapa: etapaPerdida,
          total: 1,
          valorTotal: { unidades: '2000000', moneda: 'COP' },
          oportunidades: [
            {
              id: '00000000-0010-4000-8000-000000000004',
              titulo: 'Cotización vencida',
              contactoId: '00000000-0002-4000-8000-000000000004',
              contactoNombre: 'Juan Meza',
              etapa: etapaPerdida,
              paqueteId: null,
              fechaSalida: null,
              ultimoContactoEn: null,
              valorEstimado: { unidades: '2000000', moneda: 'COP' },
              probabilidad: 0,
              destino: null,
              asesorId: null,
              asesorNombre: null,
              proximaTarea: null,
              motivoPerdida: null,
              notaPerdida: null,
              creadaEn: '2026-10-23T10:00:00Z',
            },
          ],
        },
      ],
    };

    const reporte = calcularReporteDesdePipeline(tableroMock, 'DUENO', 'este_mes');

    expect(reporte.tieneDatosReales).toBe(true);
    expect(reporte.oportunidadesCreadas).toBe(4);
    expect(reporte.oportunidadesGanadas).toBe(2);
    expect(reporte.oportunidadesPerdidas).toBe(1);

    // Tasa de conversión: 2 ganadas / (2 ganadas + 1 perdida) = 66.7%
    expect(reporte.tasaConversion).toBe(66.7);

    // Ventas totales ganadas: 4M + 8M = 12M COP
    expect(reporte.ventasTotales?.unidades).toBe('12000000');
    expect(reporte.ventasTotales?.moneda).toBe('COP');

    // Métricas no disponibles en backend permanecen en null (no inventadas)
    expect(reporte.ventasPeriodoAnterior).toBeNull();
    expect(reporte.cambioVentasPorcentaje).toBeNull();
    expect(reporte.tiempoRespuestaPromedioMinutos).toBeNull();
    expect(reporte.metaMesVentas).toBeNull();

    // Ventas por destino agrupadas
    expect(reporte.ventasPorDestino).toHaveLength(2);
    const cartagena = reporte.ventasPorDestino.find((d) => d.destino === 'Cartagena');
    expect(cartagena?.totalVentas.unidades).toBe('4000000');
    const eje = reporte.ventasPorDestino.find((d) => d.destino === 'Eje Cafetero');
    expect(eje?.totalVentas.unidades).toBe('8000000');

    // Rendimiento de asesores
    expect(reporte.rendimientoAsesores).toHaveLength(2);
    const mariana = reporte.rendimientoAsesores.find(
      (a) => a.asesorId === '00000000-0000-4000-a000-000000000001',
    );
    expect(mariana?.nombre).toBe('Mariana Pérez');
    expect(mariana?.oportunidadesGanadas).toBe(1);
    expect(mariana?.totalVentas.unidades).toBe('4000000');
    expect(mariana?.tiempoRespuestaMinutos).toBeNull(); // Sin inventar SLA

    // Embudo por etapas
    expect(reporte.conversionPorEtapa).toHaveLength(3);
  });

  it('7. obtenerEtiquetaPeriodo retorna nombres claros en español para todos los períodos', () => {
    expect(obtenerEtiquetaPeriodo('ultimos_30_dias')).toBe('Últimos 30 días');
    expect(obtenerEtiquetaPeriodo('este_mes')).toBe('Este mes');
    expect(obtenerEtiquetaPeriodo('trimestre')).toBe('Último trimestre');
    expect(obtenerEtiquetaPeriodo('ano')).toBe('Año completo');
  });

  it('8. obtenerReportePorPeriodo entrega datos consistentes con o sin tablero opcional', () => {
    const rep = obtenerReportePorPeriodo('ultimos_30_dias', 'DUENO');
    expect(rep.periodo).toBe('ultimos_30_dias');
  });
});
