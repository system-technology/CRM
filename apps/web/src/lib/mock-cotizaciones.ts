import type { CotizacionGuardada } from '@viajapro/contracts';

/**
 * Almacén simulado en memoria para cotizaciones guardadas (0c.22).
 * Incluye un ejemplo completo con dos versiones consecutivas para comprobar que
 * la versión 1 no muta cuando se crea la versión 2.
 */

export const MOCK_COTIZACION_DEMO_ID = '01932000-0000-7000-8000-000000000077';

export const MOCK_COTIZACIONES_INICIALES: CotizacionGuardada[] = [
  {
    id: MOCK_COTIZACION_DEMO_ID,
    contactoId: '00000000-0002-4000-8000-000000000001', // Juan Pérez
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
        destino: 'San Andrés Islas, Colombia',
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
        destino: 'San Andrés Islas, Colombia',
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
