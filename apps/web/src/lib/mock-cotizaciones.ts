import type { CotizacionGuardada, VersionDeCotizacion } from '@viajapro/contracts';
import { proximaOcurrencia } from './mock-fechas';

/**
 * Almacén simulado en memoria para cotizaciones guardadas (0c.22).
 * Incluye un ejemplo completo con dos versiones consecutivas para comprobar que
 * la versión 1 no muta cuando se crea la versión 2.
 */

export const MOCK_COTIZACION_DEMO_ID = '01932000-0000-7000-8000-000000000077';

const COTIZACIONES_BASE: CotizacionGuardada[] = [
  {
    id: MOCK_COTIZACION_DEMO_ID,
    contactoId: '00000000-0002-4000-8000-000000000004', // Felipe Morales (file 1043: San Andrés 2+1)
    oportunidadId: '01932000-0000-7000-8000-000000000001',
    titulo: 'Cotización San Andrés — Plan Familiar',
    estado: 'ENVIADA',
    versionEnviada: 1,
    enviadaEn: '2026-10-18T15:30:00.000Z',
    creadaEn: '2026-10-18T14:20:00.000Z',
    actualizadaEn: '2026-10-19T09:15:00.000Z',
    versiones: [
      {
        id: '01932000-0000-7000-8000-000000000101',
        numero: 1,
        creadaEn: '2026-10-18T14:20:00.000Z',
        paqueteId: '01932000-0000-7000-8000-000000000001',
        paqueteNombre: 'San Andrés — 4 días / 3 noches, todo incluido',
        destino: 'San Andrés, Colombia',
        noches: 3,
        fechaSalida: '2026-10-25',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-10-01',
        vigenciaHasta: '2026-10-31',
        deSalidaProgramada: true,
        adultos: 2,
        ninos: 0,
        infantes: 0,
        acomodacion: 'DOBLE',
        politica: {
          porcentaje: 15,
          base: 'SOBRE_EL_NETO',
          origenDeLaVenta: 'DERIVADA_DEL_NETO',
          redondeoVenta: 1000,
        },
        lineas: [
          {
            tarifaId: '01932000-0000-7000-8000-000000000011',
            nombre: 'Adulto en acomodación doble',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 2,
            precioUnitario: { unidades: '2450000', moneda: 'COP' },
            total: { unidades: '4900000', moneda: 'COP' },
            masBarata: false,
          },
        ],
        venta: { unidades: '4900000', moneda: 'COP' },
        vigenteHasta: '2026-10-24',
      },
      {
        id: '01932000-0000-7000-8000-000000000102',
        numero: 2,
        creadaEn: '2026-10-19T09:15:00.000Z',
        paqueteId: '01932000-0000-7000-8000-000000000001',
        paqueteNombre: 'San Andrés — 4 días / 3 noches, todo incluido',
        destino: 'San Andrés, Colombia',
        noches: 3,
        fechaSalida: '2026-10-25',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-10-01',
        vigenciaHasta: '2026-10-31',
        deSalidaProgramada: true,
        adultos: 2,
        ninos: 1,
        infantes: 0,
        acomodacion: 'TRIPLE',
        politica: {
          porcentaje: 15,
          base: 'SOBRE_EL_NETO',
          origenDeLaVenta: 'DERIVADA_DEL_NETO',
          redondeoVenta: 1000,
        },
        lineas: [
          {
            tarifaId: '01932000-0000-7000-8000-000000000011',
            nombre: 'Adulto en acomodación triple',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 2,
            precioUnitario: { unidades: '2350000', moneda: 'COP' },
            total: { unidades: '4700000', moneda: 'COP' },
            masBarata: false,
          },
          {
            tarifaId: '01932000-0000-7000-8000-000000000012',
            nombre: 'Niño (2-11 años)',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            veces: 1,
            precioUnitario: { unidades: '1850000', moneda: 'COP' },
            total: { unidades: '1850000', moneda: 'COP' },
            masBarata: false,
          },
        ],
        venta: { unidades: '6550000', moneda: 'COP' },
        vigenteHasta: '2026-10-24',
      },
    ],
  },
];

// Almacén en memoria de sesión
/**
 * Las fechas de arriba están escritas respecto al 2026-10-20 y se desplazan a «hoy», para que la
 * demostración no muestre una cotización ENVIADA con la vigencia y la salida ya vencidas.
 */
const FECHA_REFERENCIA_MS = Date.parse('2026-10-20T00:00:00.000Z');
const DIA_MS = 86_400_000;

function desplazarFechas<T>(valor: T, delta: number): T {
  if (typeof valor === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(valor)) {
      const movida = new Date(Date.parse(valor) + delta);
      return (valor.length === 10 ? movida.toISOString().slice(0, 10) : movida.toISOString()) as T;
    }
    return valor;
  }
  if (Array.isArray(valor)) {
    return (valor as unknown[]).map((v) => desplazarFechas(v, delta)) as T;
  }
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        desplazarFechas(v, delta),
      ]),
    ) as T;
  }
  return valor;
}

const DIAS_DESDE_REFERENCIA = Math.floor((Date.now() - FECHA_REFERENCIA_MS) / DIA_MS) * DIA_MS;

/** La de San Andrés es la del file 1043 de Felipe: su salida es la misma que la del archivo. */
const COTIZACIONES_DESPLAZADAS: CotizacionGuardada[] = desplazarFechas(
  COTIZACIONES_BASE,
  DIAS_DESDE_REFERENCIA,
).map((c) => ({
  ...c,
  versiones: c.versiones.map((v) => ({ ...v, fechaSalida: proximaOcurrencia(12, 20) })),
}));

const diaRelativo = (dias: number): string =>
  new Date(Date.now() + dias * DIA_MS).toISOString().slice(0, 10);
const instanteRelativo = (dias: number): string =>
  new Date(Date.now() + dias * DIA_MS).toISOString();

function versionDemo(
  parcial: Pick<
    VersionDeCotizacion,
    | 'id'
    | 'paqueteNombre'
    | 'destino'
    | 'noches'
    | 'fechaSalida'
    | 'adultos'
    | 'ninos'
    | 'vigenteHasta'
  > & { venta: string; linea: string; edadesNinos?: number[] },
): VersionDeCotizacion {
  const venta = { unidades: parcial.venta, moneda: 'COP' as const };
  return {
    id: parcial.id,
    numero: 1,
    creadaEn: instanteRelativo(-2),
    paqueteId: '01932000-0000-7000-8000-000000000001',
    paqueteNombre: parcial.paqueteNombre,
    destino: parcial.destino,
    noches: parcial.noches,
    fechaSalida: parcial.fechaSalida,
    vigenciaId: '01932000-0000-7000-8000-000000000001',
    vigenciaDesde: diaRelativo(-30),
    vigenciaHasta: diaRelativo(200),
    deSalidaProgramada: true,
    adultos: parcial.adultos,
    ninos: parcial.ninos,
    infantes: 0,
    acomodacion: 'DOBLE',
    ...(parcial.edadesNinos ? { edadesNinos: parcial.edadesNinos } : {}),
    lineas: [
      {
        tarifaId: '01932000-0000-7000-8000-000000000011',
        nombre: parcial.linea,
        unidad: 'POR_PERSONA',
        cubrePasajeros: parcial.adultos + parcial.ninos,
        veces: 1,
        precioUnitario: venta,
        total: venta,
        masBarata: false,
      },
    ],
    venta,
    vigenteHasta: parcial.vigenteHasta,
  };
}

/**
 * Las cotizaciones de los chats de la demostración: lo que el cliente pidió es lo que se cotizó
 * (Juan: Cancún en diciembre para 2 adultos y 2 niños; Ana: Curazao para dos), con su vigencia.
 */
function cotizacionesDeLosChats(): CotizacionGuardada[] {
  const cancun = proximaOcurrencia(12, 15);
  const curazao = proximaOcurrencia(12, 5);
  const cartagena = proximaOcurrencia(1, 15);
  return [
    {
      id: '01932000-0000-7000-8000-000000000078',
      contactoId: '00000000-0002-4000-8000-000000000001', // Juan Pérez
      oportunidadId: '00000000-0010-4000-8000-000000000004',
      titulo: 'Cancún todo incluido — familia (2 adultos y 2 niños)',
      estado: 'ENVIADA',
      versionEnviada: 1,
      enviadaEn: instanteRelativo(-1),
      creadaEn: instanteRelativo(-2),
      actualizadaEn: instanteRelativo(-1),
      versiones: [
        versionDemo({
          id: '01932000-0000-7000-8000-000000000111',
          paqueteNombre: 'Cancún — 5 días / 4 noches, todo incluido',
          destino: 'Cancún, México',
          noches: 4,
          fechaSalida: cancun,
          adultos: 2,
          ninos: 2,
          edadesNinos: [7, 10],
          venta: '12500000',
          linea: 'Adulto y niño en acomodación doble',
          vigenteHasta: diaRelativo(3),
        }),
      ],
    },
    {
      id: '01932000-0000-7000-8000-000000000079',
      contactoId: '00000000-0002-4000-8000-000000000002', // Ana Martínez
      oportunidadId: '00000000-0010-4000-8000-000000000006',
      titulo: 'Curazao 5 noches con desayuno (2 adultos)',
      estado: 'ENVIADA',
      versionEnviada: 1,
      enviadaEn: instanteRelativo(-3),
      creadaEn: instanteRelativo(-4),
      actualizadaEn: instanteRelativo(-3),
      versiones: [
        versionDemo({
          id: '01932000-0000-7000-8000-000000000112',
          paqueteNombre: 'Curazao — 6 días / 5 noches, con desayuno',
          destino: 'Curazao',
          noches: 5,
          fechaSalida: curazao,
          adultos: 2,
          ninos: 0,
          venta: '9500000',
          linea: 'Adulto en acomodación doble',
          vigenteHasta: diaRelativo(1),
        }),
      ],
    },
    {
      id: '01932000-0000-7000-8000-00000000007a',
      contactoId: '00000000-0002-4000-8000-000000000005', // Diana Ramírez (file 1044: Cartagena)
      oportunidadId: null,
      titulo: 'Cartagena Histórica 4 días (2 adultos)',
      estado: 'ACEPTADA',
      versionEnviada: 1,
      enviadaEn: instanteRelativo(-12),
      creadaEn: instanteRelativo(-13),
      actualizadaEn: instanteRelativo(-10),
      versiones: [
        versionDemo({
          id: '01932000-0000-7000-8000-000000000113',
          paqueteNombre: 'Cartagena Histórica 4 días',
          destino: 'Cartagena, Colombia',
          noches: 3,
          fechaSalida: cartagena,
          adultos: 2,
          ninos: 0,
          venta: '4800000',
          linea: 'Adulto en acomodación doble',
          vigenteHasta: diaRelativo(-8),
        }),
      ],
    },
  ];
}

export const MOCK_COTIZACIONES_INICIALES: CotizacionGuardada[] = [
  ...COTIZACIONES_DESPLAZADAS,
  ...cotizacionesDeLosChats(),
];

const storeCotizaciones = new Map<string, CotizacionGuardada>();

for (const c of MOCK_COTIZACIONES_INICIALES) {
  storeCotizaciones.set(c.id, c);
}

export function obtenerMockCotizaciones(): CotizacionGuardada[] {
  return Array.from(storeCotizaciones.values());
}

export function obtenerMockCotizacionPorId(id: string): CotizacionGuardada | undefined {
  return storeCotizaciones.get(id);
}

export function guardarMockCotizacion(cotizacion: CotizacionGuardada): void {
  storeCotizaciones.set(cotizacion.id, cotizacion);
}
