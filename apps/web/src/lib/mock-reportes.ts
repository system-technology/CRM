import type { Dinero } from '@viajapro/contracts';

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
  tiempoRespuestaMinutos: number;
}

export interface ReporteComercial {
  periodo: RangoPeriodo;
  ventasTotales: Dinero;
  ventasPeriodoAnterior: Dinero;
  cambioVentasPorcentaje: number;
  oportunidadesCreadas: number;
  oportunidadesPeriodoAnterior: number;
  cambioOportunidadesPorcentaje: number;
  oportunidadesGanadas: number;
  oportunidadesPerdidas: number;
  tasaConversion: number;
  tasaConversionPeriodoAnterior: number;
  tiempoRespuestaPromedioMinutos: number;
  tiempoRespuestaPeriodoAnteriorMinutos: number;
  costoNetoTotal: Dinero;
  margenTotal: Dinero;
  margenPorcentaje: number;
  metaMesVentas: Dinero;
  porcentajeMetaMes: number;
  ventasPorDestino: VentaPorDestino[];
  conversionPorEtapa: EtapaConversion[];
  rendimientoAsesores: RendimientoAsesor[];
}

export const MOCK_REPORTES_POR_PERIODO: Record<RangoPeriodo, ReporteComercial> = {
  ultimos_30_dias: {
    periodo: 'ultimos_30_dias',
    ventasTotales: { unidades: '48950000', moneda: 'COP' }, // $48.950.000 COP
    ventasPeriodoAnterior: { unidades: '42200000', moneda: 'COP' }, // $42.200.000 COP
    cambioVentasPorcentaje: 16.0,
    oportunidadesCreadas: 34,
    oportunidadesPeriodoAnterior: 29,
    cambioOportunidadesPorcentaje: 17.2,
    oportunidadesGanadas: 18,
    oportunidadesPerdidas: 6,
    tasaConversion: 75.0, // 18 / (18 + 6)
    tasaConversionPeriodoAnterior: 68.5,
    tiempoRespuestaPromedioMinutos: 4.8,
    tiempoRespuestaPeriodoAnteriorMinutos: 7.2,
    costoNetoTotal: { unidades: '39200000', moneda: 'COP' },
    margenTotal: { unidades: '9750000', moneda: 'COP' },
    margenPorcentaje: 19.9,
    metaMesVentas: { unidades: '60000000', moneda: 'COP' },
    porcentajeMetaMes: 81.6,
    ventasPorDestino: [
      {
        destino: 'San Andrés',
        totalVentas: { unidades: '19080000', moneda: 'COP' },
        porcentaje: 39.0,
        paquetesVendidos: 12,
      },
      {
        destino: 'Punta Cana',
        totalVentas: { unidades: '15560000', moneda: 'COP' },
        porcentaje: 31.8,
        paquetesVendidos: 4,
      },
      {
        destino: 'Cartagena',
        totalVentas: { unidades: '7740000', moneda: 'COP' },
        porcentaje: 15.8,
        paquetesVendidos: 6,
      },
      {
        destino: 'Cancún',
        totalVentas: { unidades: '4250000', moneda: 'COP' },
        porcentaje: 8.7,
        paquetesVendidos: 1,
      },
      {
        destino: 'Eje Cafetero',
        totalVentas: { unidades: '2320000', moneda: 'COP' },
        porcentaje: 4.7,
        paquetesVendidos: 2,
      },
    ],
    conversionPorEtapa: [
      {
        etapaId: '01932000-0000-7000-8000-0000000000e1',
        nombre: 'Nuevo Lead',
        cantidad: 34,
        porcentajeEmbudo: 100,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e2',
        nombre: 'En Cotización',
        cantidad: 28,
        porcentajeEmbudo: 82.4,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e3',
        nombre: 'En Negociación',
        cantidad: 22,
        porcentajeEmbudo: 64.7,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e4',
        nombre: 'Ganada',
        cantidad: 18,
        porcentajeEmbudo: 52.9,
      },
    ],
    rendimientoAsesores: [
      {
        asesorId: '01932000-0000-7000-8000-0000000000u1',
        nombre: 'Ana Lucía Pérez',
        correo: 'ana@agenciademo.test',
        avatar: 'AP',
        conversaciones: 112,
        oportunidadesGanadas: 10,
        totalVentas: { unidades: '28450000', moneda: 'COP' },
        tiempoRespuestaMinutos: 3.9,
      },
      {
        asesorId: '01932000-0000-7000-8000-0000000000u2',
        nombre: 'Carlos Mejía',
        correo: 'carlos@agenciademo.test',
        avatar: 'CM',
        conversaciones: 94,
        oportunidadesGanadas: 8,
        totalVentas: { unidades: '20500000', moneda: 'COP' },
        tiempoRespuestaMinutos: 5.7,
      },
    ],
  },
  este_mes: {
    periodo: 'este_mes',
    ventasTotales: { unidades: '36800000', moneda: 'COP' },
    ventasPeriodoAnterior: { unidades: '31500000', moneda: 'COP' },
    cambioVentasPorcentaje: 16.8,
    oportunidadesCreadas: 26,
    oportunidadesPeriodoAnterior: 22,
    cambioOportunidadesPorcentaje: 18.1,
    oportunidadesGanadas: 14,
    oportunidadesPerdidas: 4,
    tasaConversion: 77.8,
    tasaConversionPeriodoAnterior: 70.0,
    tiempoRespuestaPromedioMinutos: 4.5,
    tiempoRespuestaPeriodoAnteriorMinutos: 6.8,
    costoNetoTotal: { unidades: '29500000', moneda: 'COP' },
    margenTotal: { unidades: '7300000', moneda: 'COP' },
    margenPorcentaje: 19.8,
    metaMesVentas: { unidades: '60000000', moneda: 'COP' },
    porcentajeMetaMes: 61.3,
    ventasPorDestino: [
      {
        destino: 'San Andrés',
        totalVentas: { unidades: '15900000', moneda: 'COP' },
        porcentaje: 43.2,
        paquetesVendidos: 10,
      },
      {
        destino: 'Punta Cana',
        totalVentas: { unidades: '11670000', moneda: 'COP' },
        porcentaje: 31.7,
        paquetesVendidos: 3,
      },
      {
        destino: 'Cartagena',
        totalVentas: { unidades: '5160000', moneda: 'COP' },
        porcentaje: 14.0,
        paquetesVendidos: 4,
      },
      {
        destino: 'Eje Cafetero',
        totalVentas: { unidades: '4070000', moneda: 'COP' },
        porcentaje: 11.1,
        paquetesVendidos: 3,
      },
    ],
    conversionPorEtapa: [
      {
        etapaId: '01932000-0000-7000-8000-0000000000e1',
        nombre: 'Nuevo Lead',
        cantidad: 26,
        porcentajeEmbudo: 100,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e2',
        nombre: 'En Cotización',
        cantidad: 22,
        porcentajeEmbudo: 84.6,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e3',
        nombre: 'En Negociación',
        cantidad: 17,
        porcentajeEmbudo: 65.4,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e4',
        nombre: 'Ganada',
        cantidad: 14,
        porcentajeEmbudo: 53.8,
      },
    ],
    rendimientoAsesores: [
      {
        asesorId: '01932000-0000-7000-8000-0000000000u1',
        nombre: 'Ana Lucía Pérez',
        correo: 'ana@agenciademo.test',
        avatar: 'AP',
        conversaciones: 88,
        oportunidadesGanadas: 8,
        totalVentas: { unidades: '21500000', moneda: 'COP' },
        tiempoRespuestaMinutos: 3.8,
      },
      {
        asesorId: '01932000-0000-7000-8000-0000000000u2',
        nombre: 'Carlos Mejía',
        correo: 'carlos@agenciademo.test',
        avatar: 'CM',
        conversaciones: 76,
        oportunidadesGanadas: 6,
        totalVentas: { unidades: '15300000', moneda: 'COP' },
        tiempoRespuestaMinutos: 5.2,
      },
    ],
  },
  trimestre: {
    periodo: 'trimestre',
    ventasTotales: { unidades: '142600000', moneda: 'COP' },
    ventasPeriodoAnterior: { unidades: '121000000', moneda: 'COP' },
    cambioVentasPorcentaje: 17.9,
    oportunidadesCreadas: 104,
    oportunidadesPeriodoAnterior: 88,
    cambioOportunidadesPorcentaje: 18.2,
    oportunidadesGanadas: 54,
    oportunidadesPerdidas: 18,
    tasaConversion: 75.0,
    tasaConversionPeriodoAnterior: 69.2,
    tiempoRespuestaPromedioMinutos: 5.1,
    tiempoRespuestaPeriodoAnteriorMinutos: 7.9,
    costoNetoTotal: { unidades: '114200000', moneda: 'COP' },
    margenTotal: { unidades: '28400000', moneda: 'COP' },
    margenPorcentaje: 19.9,
    metaMesVentas: { unidades: '180000000', moneda: 'COP' },
    porcentajeMetaMes: 79.2,
    ventasPorDestino: [
      {
        destino: 'San Andrés',
        totalVentas: { unidades: '57040000', moneda: 'COP' },
        porcentaje: 40.0,
        paquetesVendidos: 36,
      },
      {
        destino: 'Punta Cana',
        totalVentas: { unidades: '45632000', moneda: 'COP' },
        porcentaje: 32.0,
        paquetesVendidos: 12,
      },
      {
        destino: 'Cartagena',
        totalVentas: { unidades: '22816000', moneda: 'COP' },
        porcentaje: 16.0,
        paquetesVendidos: 18,
      },
      {
        destino: 'Cancún',
        totalVentas: { unidades: '11408000', moneda: 'COP' },
        porcentaje: 8.0,
        paquetesVendidos: 3,
      },
      {
        destino: 'Eje Cafetero',
        totalVentas: { unidades: '5704000', moneda: 'COP' },
        porcentaje: 4.0,
        paquetesVendidos: 5,
      },
    ],
    conversionPorEtapa: [
      {
        etapaId: '01932000-0000-7000-8000-0000000000e1',
        nombre: 'Nuevo Lead',
        cantidad: 104,
        porcentajeEmbudo: 100,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e2',
        nombre: 'En Cotización',
        cantidad: 86,
        porcentajeEmbudo: 82.7,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e3',
        nombre: 'En Negociación',
        cantidad: 68,
        porcentajeEmbudo: 65.4,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e4',
        nombre: 'Ganada',
        cantidad: 54,
        porcentajeEmbudo: 51.9,
      },
    ],
    rendimientoAsesores: [
      {
        asesorId: '01932000-0000-7000-8000-0000000000u1',
        nombre: 'Ana Lucía Pérez',
        correo: 'ana@agenciademo.test',
        avatar: 'AP',
        conversaciones: 340,
        oportunidadesGanadas: 31,
        totalVentas: { unidades: '82400000', moneda: 'COP' },
        tiempoRespuestaMinutos: 4.2,
      },
      {
        asesorId: '01932000-0000-7000-8000-0000000000u2',
        nombre: 'Carlos Mejía',
        correo: 'carlos@agenciademo.test',
        avatar: 'CM',
        conversaciones: 295,
        oportunidadesGanadas: 23,
        totalVentas: { unidades: '60200000', moneda: 'COP' },
        tiempoRespuestaMinutos: 6.0,
      },
    ],
  },
  ano: {
    periodo: 'ano',
    ventasTotales: { unidades: '530000000', moneda: 'COP' },
    ventasPeriodoAnterior: { unidades: '450000000', moneda: 'COP' },
    cambioVentasPorcentaje: 17.8,
    oportunidadesCreadas: 380,
    oportunidadesPeriodoAnterior: 320,
    cambioOportunidadesPorcentaje: 18.7,
    oportunidadesGanadas: 198,
    oportunidadesPerdidas: 62,
    tasaConversion: 76.2,
    tasaConversionPeriodoAnterior: 71.0,
    tiempoRespuestaPromedioMinutos: 5.4,
    tiempoRespuestaPeriodoAnteriorMinutos: 8.5,
    costoNetoTotal: { unidades: '424500000', moneda: 'COP' },
    margenTotal: { unidades: '105500000', moneda: 'COP' },
    margenPorcentaje: 19.9,
    metaMesVentas: { unidades: '650000000', moneda: 'COP' },
    porcentajeMetaMes: 81.5,
    ventasPorDestino: [
      {
        destino: 'San Andrés',
        totalVentas: { unidades: '212000000', moneda: 'COP' },
        porcentaje: 40.0,
        paquetesVendidos: 133,
      },
      {
        destino: 'Punta Cana',
        totalVentas: { unidades: '169600000', moneda: 'COP' },
        porcentaje: 32.0,
        paquetesVendidos: 44,
      },
      {
        destino: 'Cartagena',
        totalVentas: { unidades: '84800000', moneda: 'COP' },
        porcentaje: 16.0,
        paquetesVendidos: 66,
      },
      {
        destino: 'Cancún',
        totalVentas: { unidades: '42400000', moneda: 'COP' },
        porcentaje: 8.0,
        paquetesVendidos: 12,
      },
      {
        destino: 'Eje Cafetero',
        totalVentas: { unidades: '21200000', moneda: 'COP' },
        porcentaje: 4.0,
        paquetesVendidos: 18,
      },
    ],
    conversionPorEtapa: [
      {
        etapaId: '01932000-0000-7000-8000-0000000000e1',
        nombre: 'Nuevo Lead',
        cantidad: 380,
        porcentajeEmbudo: 100,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e2',
        nombre: 'En Cotización',
        cantidad: 310,
        porcentajeEmbudo: 81.6,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e3',
        nombre: 'En Negociación',
        cantidad: 245,
        porcentajeEmbudo: 64.5,
      },
      {
        etapaId: '01932000-0000-7000-8000-0000000000e4',
        nombre: 'Ganada',
        cantidad: 198,
        porcentajeEmbudo: 52.1,
      },
    ],
    rendimientoAsesores: [
      {
        asesorId: '01932000-0000-7000-8000-0000000000u1',
        nombre: 'Ana Lucía Pérez',
        correo: 'ana@agenciademo.test',
        avatar: 'AP',
        conversaciones: 1280,
        oportunidadesGanadas: 112,
        totalVentas: { unidades: '302000000', moneda: 'COP' },
        tiempoRespuestaMinutos: 4.6,
      },
      {
        asesorId: '01932000-0000-7000-8000-0000000000u2',
        nombre: 'Carlos Mejía',
        correo: 'carlos@agenciademo.test',
        avatar: 'CM',
        conversaciones: 1105,
        oportunidadesGanadas: 86,
        totalVentas: { unidades: '228000000', moneda: 'COP' },
        tiempoRespuestaMinutos: 6.2,
      },
    ],
  },
};
