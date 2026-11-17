import type { DetalleDeArchivo, ReservaDelArchivo } from '@viajapro/contracts';

/**
 * Archivos de viaje de demostración, en la forma del contrato (`DetalleDeArchivo`). Solo se leen en
 * modo demo (`estaUsandoApiReal() === false`); los plazos son relativos a «ahora» para que el
 * semáforo se vea. Sin netoUnidades: la demo se comporta como un rol sin permiso de neto.
 */
const HORA = 3_600_000;
const en = (horas: number): string => new Date(Date.now() + horas * HORA).toISOString();

function reserva(
  parcial: Partial<ReservaDelArchivo> & Pick<ReservaDelArchivo, 'id'>,
): ReservaDelArchivo {
  return {
    mayoristaId: null,
    mayoristaNombre: null,
    moneda: 'COP',
    localizador: null,
    estado: 'PENDIENTE',
    solicitadaEn: null,
    confirmadaEn: null,
    abonadaEn: null,
    pagadaEn: null,
    timeLimit: null,
    pagoTotalVenceEn: null,
    motivoCaida: null,
    nota: null,
    plazoVigente: null,
    semaforo: null,
    ...parcial,
  };
}

const R1 = reserva({
  id: '00000000-0030-4000-8000-000000000011',
  mayoristaId: '00000000-0031-4000-8000-000000000001',
  mayoristaNombre: 'Mayorista Caribe Tours',
  localizador: 'CT-48213',
  estado: 'CONFIRMADA',
  confirmadaEn: en(-30),
  timeLimit: en(9),
  plazoVigente: en(9),
  semaforo: 'MENOS_DE_24_H',
});
const R2 = reserva({
  id: '00000000-0030-4000-8000-000000000012',
  mayoristaId: '00000000-0031-4000-8000-000000000002',
  mayoristaNombre: 'Aéreos del Sur',
  estado: 'SOLICITADA',
  solicitadaEn: en(-5),
});
const R3 = reserva({
  id: '00000000-0030-4000-8000-000000000021',
  mayoristaId: '00000000-0031-4000-8000-000000000001',
  mayoristaNombre: 'Mayorista Caribe Tours',
  localizador: 'CT-50990',
  estado: 'ABONADA_AL_PROVEEDOR',
  abonadaEn: en(-72),
  timeLimit: en(-60),
  pagoTotalVenceEn: en(24 * 6),
  plazoVigente: en(24 * 6),
  semaforo: 'EN_PLAZO',
});

export const MOCK_DETALLES_ARCHIVOS: DetalleDeArchivo[] = [
  {
    id: '00000000-0030-4000-8000-000000000001',
    numero: 1043,
    contactoId: '00000000-0002-4000-8000-000000000004',
    oportunidadId: null,
    cotizacionId: '00000000-0032-4000-8000-000000000001',
    versionCotizacion: 1,
    paqueteNombre: 'San Andrés Todo Incluido Familiar',
    destino: 'San Andrés Islas, Colombia',
    fechaSalida: '2026-12-20',
    noches: 5,
    adultos: 2,
    ninos: 1,
    infantes: 0,
    venta: { unidades: '6200000', moneda: 'COP' },
    trm: null,
    estado: 'ABIERTO',
    avance: 'POR_CONFIRMAR',
    motivoCancelacion: null,
    notaCancelacion: null,
    canceladoEn: null,
    proximoPlazo: R1.plazoVigente,
    semaforo: 'MENOS_DE_24_H',
    reservas: [R1, R2],
    creadoEn: en(-50),
    pasajeros: [
      {
        id: '00000000-0033-4000-8000-000000000001',
        nombre: 'Felipe Morales',
        tipo: 'ADT',
        edadAlViaje: null,
        esTitular: true,
        orden: 0,
      },
      {
        id: '00000000-0033-4000-8000-000000000002',
        nombre: 'Laura Gómez',
        tipo: 'ADT',
        edadAlViaje: null,
        esTitular: false,
        orden: 1,
      },
      {
        id: '00000000-0033-4000-8000-000000000003',
        nombre: 'Mateo Morales',
        tipo: 'CHD',
        edadAlViaje: 8,
        esTitular: false,
        orden: 2,
      },
    ],
    avisos: [],
  },
  {
    id: '00000000-0030-4000-8000-000000000002',
    numero: 1044,
    contactoId: '00000000-0002-4000-8000-000000000005',
    oportunidadId: null,
    cotizacionId: '00000000-0032-4000-8000-000000000002',
    versionCotizacion: 2,
    paqueteNombre: 'Cartagena Histórica 4 días',
    destino: 'Cartagena, Colombia',
    fechaSalida: '2027-01-15',
    noches: 3,
    adultos: 2,
    ninos: 0,
    infantes: 0,
    venta: { unidades: '4100000', moneda: 'COP' },
    trm: null,
    estado: 'ABIERTO',
    avance: 'CONFIRMADO',
    motivoCancelacion: null,
    notaCancelacion: null,
    canceladoEn: null,
    proximoPlazo: R3.plazoVigente,
    semaforo: 'EN_PLAZO',
    reservas: [R3],
    creadoEn: en(-120),
    pasajeros: [
      {
        id: '00000000-0033-4000-8000-000000000011',
        nombre: 'Andrea Ruiz',
        tipo: 'ADT',
        edadAlViaje: null,
        esTitular: true,
        orden: 0,
      },
      {
        id: '00000000-0033-4000-8000-000000000012',
        nombre: 'Camilo Ruiz',
        tipo: 'ADT',
        edadAlViaje: null,
        esTitular: false,
        orden: 1,
      },
    ],
    avisos: [],
  },
];
