import type {
  Acomodacion,
  Mayorista,
  Paquete,
  TarifaDeDetalle,
  TipoPasajero,
  VigenciaDeDetalle,
} from '@viajapro/contracts';

/**
 * Un paquete tal como lo pinta la ficha: el contrato `Paquete` más el mayorista y las
 * **vigencias con sus tarifas**, que es lo que lee el cotizador (ADR-0025 paso 2), también el
 * simulador sin API (`calcularCotizacionMock`).
 */
export interface PaqueteConDetalle extends Paquete {
  mayorista: Mayorista | null;
  vigencias: VigenciaDeDetalle[];
}

const ETIQUETA_TIPO: Record<TipoPasajero, string> = { ADT: 'Adulto', CHD: 'Niño', INF: 'Infante' };

/** Una tarifa por persona de muestra, en COP (unidad mínima = el peso, R8). */
function tarifa(
  id: string,
  acomodacion: Acomodacion,
  tipoPasajero: TipoPasajero,
  neto: number,
  venta: number,
  edadMinima: number | null,
  edadMaxima: number | null,
): TarifaDeDetalle {
  return {
    id,
    nombre: `${ETIQUETA_TIPO[tipoPasajero]} en ${acomodacion.toLowerCase()}`,
    unidad: 'POR_PERSONA',
    cubrePasajeros: 1,
    aditiva: false,
    neto: { unidades: String(neto), moneda: 'COP' },
    venta: { unidades: String(venta), moneda: 'COP' },
    condicion: {
      acomodacion,
      tipoPasajero,
      edadMinima,
      edadMaxima,
      pasajerosMinimo: null,
      pasajerosMaximo: null,
      ocupaSilla: null,
    },
  };
}

/** Una vigencia de rango sin publicar con sus tarifas. No tiene nombre (ADR-0025). */
function vigencia(
  id: string,
  desde: string,
  hasta: string,
  tarifas: TarifaDeDetalle[],
): VigenciaDeDetalle {
  return { id, desde, hasta, publicada: false, cupoTotal: null, tarifas };
}

export const MAYORISTA_CARIBE: Mayorista = {
  id: '01932000-0000-7000-8000-0000000000a1',
  nombre: 'Mayorista Caribe S.A.S.',
  contactoNombre: 'Jorge Restrepo',
  contactoCorreo: 'reservas@mayoristacaribe.test',
  contactoTelefono: '+573105551234',
  diasTimeLimit: 5,
  notas: 'Especialista en destinos de playa colombianos e internacionales. Cupos garantizados.',
  creadoEn: '2026-01-10T12:00:00.000Z',
};

export const OPERADORA_ANDINA: Mayorista = {
  id: '01932000-0000-7000-8000-0000000000a2',
  nombre: 'Operadora Andina',
  contactoNombre: 'Liliana Gómez',
  contactoCorreo: 'operaciones@operadoraandina.test',
  contactoTelefono: '+573124445678',
  diasTimeLimit: 3,
  notas: 'Líder en circuitos nacionales, eje cafetero y paquetes corporativos.',
  creadoEn: '2026-01-15T09:30:00.000Z',
};

export const MOCK_MAYORISTAS: Mayorista[] = [MAYORISTA_CARIBE, OPERADORA_ANDINA];

export const MOCK_PAQUETES_CATALOGO: PaqueteConDetalle[] = [
  {
    id: '01932000-0000-7000-8000-000000000001',
    nombre: 'San Andrés — 4 días / 3 noches, todo incluido',
    destino: 'San Andrés',
    paisIso: 'CO',
    dias: 4,
    noches: 3,
    planAlimentacion: 'TODO_INCLUIDO',
    mayoristaId: MAYORISTA_CARIBE.id,
    activo: true,
    descripcion:
      'El destino más vendido del Caribe colombiano. Vuelos directos, hotel frente al mar y tarjeta OCCRE incluida.',
    inclusiones: [
      'Tiquetes aéreos Bogotá — San Andrés — Bogotá',
      'Traslados aeropuerto — hotel — aeropuerto',
      'Alojamiento 3 noches con todo incluido (desayuno, almuerzo, cena y bar abierto)',
      'Tarjeta de turismo OCCRE',
      'Seguro de asistencia médica con cobertura de cancelación',
    ],
    exclusiones: [
      'Impuesto ecológico de ingreso a Providencia',
      'Deportes náuticos motorizados',
      'Gastos y compras no especificadas',
    ],
    creadoEn: '2026-02-01T10:00:00.000Z',
    mayorista: MAYORISTA_CARIBE,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000b1', '2027-02-01', '2027-06-15', [
        tarifa(
          '01932000-0000-7000-8000-0000000000c1',
          'DOBLE',
          'ADT',
          1280000,
          1590000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000c2',
          'TRIPLE',
          'ADT',
          1150000,
          1430000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000c3',
          'CUADRUPLE',
          'ADT',
          1080000,
          1340000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000c4',
          'SENCILLA',
          'ADT',
          1850000,
          2290000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000c5', 'DOBLE', 'CHD', 890000, 1110000, 2, 11),
        tarifa('01932000-0000-7000-8000-0000000000c6', 'DOBLE', 'INF', 180000, 220000, 0, 1),
      ]),
      vigencia('01932000-0000-7000-8000-0000000000b2', '2027-06-16', '2027-08-20', [
        tarifa(
          '01932000-0000-7000-8000-0000000000c7',
          'DOBLE',
          'ADT',
          1580000,
          1980000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000c8',
          'TRIPLE',
          'ADT',
          1420000,
          1790000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000c9',
          'SENCILLA',
          'ADT',
          2200000,
          2750000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000ca', 'DOBLE', 'CHD', 1090000, 1350000, 2, 11),
      ]),
      vigencia('01932000-0000-7000-8000-0000000000bf', '2027-12-15', '2028-01-15', [
        tarifa(
          '01932000-0000-7000-8000-0000000000cf',
          'DOBLE',
          'ADT',
          2150000,
          2690000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d1',
          'TRIPLE',
          'ADT',
          1980000,
          2480000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d2',
          'CUADRUPLE',
          'ADT',
          1850000,
          2310000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d3',
          'SENCILLA',
          'ADT',
          3100000,
          3870000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000d4', 'DOBLE', 'CHD', 1490000, 1860000, 2, 11),
        tarifa('01932000-0000-7000-8000-0000000000d5', 'DOBLE', 'INF', 220000, 270000, 0, 1),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000002',
    nombre: 'Cartagena Histórica y Playas de Barú — 4 días / 3 noches',
    destino: 'Cartagena',
    paisIso: 'CO',
    dias: 4,
    noches: 3,
    planAlimentacion: 'DESAYUNO',
    mayoristaId: OPERADORA_ANDINA.id,
    activo: true,
    descripcion:
      'Plan ideal para parejas y familias que desean combinar el encanto de la Ciudad Amurallada con las playas cristalinas de Barú.',
    inclusiones: [
      'Tiquetes aéreos ida y regreso',
      'Alojamiento 3 noches en hotel de categoría seleccionada',
      'Desayunos diarios tipo buffet',
      'Tour a las Islas del Rosario en lancha rápida con almuerzo típico caribeño',
      'Asistencia médica integral',
    ],
    exclusiones: [
      'Tasa portuaria muelle La Bodeguita ($28.000 COP)',
      'Almuerzos no estipulados y cenas',
      'Gastos no especificados en el plan',
    ],
    creadoEn: '2026-02-05T14:15:00.000Z',
    mayorista: OPERADORA_ANDINA,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000b3', '2027-01-15', '2027-11-30', [
        tarifa(
          '01932000-0000-7000-8000-0000000000cb',
          'DOBLE',
          'ADT',
          1020000,
          1290000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000cc',
          'TRIPLE',
          'ADT',
          930000,
          1180000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000cd',
          'SENCILLA',
          'ADT',
          1430000,
          1790000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000ce', 'DOBLE', 'CHD', 710000, 890000, 2, 11),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000003',
    nombre: 'Punta Cana — 5 días / 4 noches en Resort 5 Estrellas',
    destino: 'Punta Cana',
    paisIso: 'DO',
    dias: 5,
    noches: 4,
    planAlimentacion: 'TODO_INCLUIDO',
    mayoristaId: MAYORISTA_CARIBE.id,
    activo: true,
    descripcion:
      'Vacaciones de lujo en el Caribe dominicano. Resort 5 estrellas frente a la playa Bavaro con gastronomía internacional.',
    inclusiones: [
      'Tiquetes aéreos internacionales Bogotá — Punta Cana — Bogotá',
      'Alojamiento 4 noches en Resort 5 Estrellas',
      'Plan Todo Incluido 24 horas (alimentos gourmet y bebidas premium)',
      'Traslados aeropuerto — hotel — aeropuerto en autobús climatizado',
      'Asistencia médica internacional de viaje con cobertura COVID',
    ],
    exclusiones: [
      'Propinas y gratificaciones para personal del resort',
      'Servicios de spa y deportes motorizados',
      'Excursión adicional a Isla Saona',
    ],
    creadoEn: '2026-02-10T16:00:00.000Z',
    mayorista: MAYORISTA_CARIBE,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000b4', '2027-03-01', '2027-12-15', [
        tarifa(
          '01932000-0000-7000-8000-0000000000cf',
          'DOBLE',
          'ADT',
          3150000,
          3890000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d0',
          'TRIPLE',
          'ADT',
          2900000,
          3590000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d1',
          'SENCILLA',
          'ADT',
          4200000,
          5200000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000d2', 'DOBLE', 'CHD', 1700000, 2100000, 2, 11),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000004',
    nombre: 'Cancún y Riviera Maya — 5 días / 4 noches Todo Incluido',
    destino: 'Cancún',
    paisIso: 'MX',
    dias: 5,
    noches: 4,
    planAlimentacion: 'TODO_INCLUIDO',
    mayoristaId: OPERADORA_ANDINA.id,
    activo: true,
    descripcion:
      'Sol, playa y cultura maya. Hospedaje en resort de Cancún con pase incluido para un parque temático.',
    inclusiones: [
      'Tiquetes aéreos ida y regreso vía Avianca o Copa',
      '4 noches de alojamiento plan All Inclusive',
      'Traslados compartidos aeropuerto — hotel — aeropuerto',
      'Entrada al parque Xcaret básico con espectáculo nocturno',
      'Tarjeta de asistencia médica internacional',
    ],
    exclusiones: [
      'Impuesto de saneamiento ambiental en el hotel ($4 USD por noche/habitación)',
      'Actividades opcionales acuáticas',
      'Alimentos y bebidas durante traslados',
    ],
    creadoEn: '2026-02-12T11:20:00.000Z',
    mayorista: OPERADORA_ANDINA,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000b5', '2027-04-01', '2027-10-31', [
        tarifa(
          '01932000-0000-7000-8000-0000000000d3',
          'DOBLE',
          'ADT',
          2800000,
          3450000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d4',
          'TRIPLE',
          'ADT',
          2590000,
          3190000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d5',
          'SENCILLA',
          'ADT',
          3800000,
          4690000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000d6', 'DOBLE', 'CHD', 1580000, 1950000, 2, 11),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000005',
    nombre: 'Eje Cafetero Mágico — 4 días / 3 noches en Finca Típica',
    destino: 'Eje Cafetero',
    paisIso: 'CO',
    dias: 4,
    noches: 3,
    planAlimentacion: 'MEDIA_PENSION',
    mayoristaId: OPERADORA_ANDINA.id,
    activo: true,
    descripcion:
      'Conecta con la naturaleza y la cultura del Paisaje Cultural Cafetero. Alojamiento en finca campestre con arquitectura típica.',
    inclusiones: [
      'Vuelos Bogotá — Armenia / Pereira — Bogotá',
      '3 noches en hacienda cafetera tradicional con piscina',
      'Media pensión: desayunos y cenas con gastronomía típica',
      'Pasaporte múltiple al Parque Nacional del Café',
      'Excursión al Valle de Cocora y Salento en Jeep Willys',
      'Asistencia médica de cobertura nacional',
    ],
    exclusiones: [
      'Almuerzos en parques y recorridos',
      'Souvenirs y compras personales',
      'Paseos a caballo no programados',
    ],
    creadoEn: '2026-02-15T09:00:00.000Z',
    mayorista: OPERADORA_ANDINA,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000b6', '2027-01-10', '2027-12-20', [
        tarifa('01932000-0000-7000-8000-0000000000d7', 'DOBLE', 'ADT', 920000, 1150000, null, null),
        tarifa(
          '01932000-0000-7000-8000-0000000000d8',
          'TRIPLE',
          'ADT',
          820000,
          1020000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000d9',
          'CUADRUPLE',
          'ADT',
          760000,
          950000,
          null,
          null,
        ),
        tarifa(
          '01932000-0000-7000-8000-0000000000da',
          'SENCILLA',
          'ADT',
          1240000,
          1550000,
          null,
          null,
        ),
        tarifa('01932000-0000-7000-8000-0000000000db', 'DOBLE', 'CHD', 620000, 780000, 2, 11),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000006',
    nombre: 'Santa Marta y Parque Tayrona 2026 (Tarifario Vencido)',
    destino: 'Santa Marta',
    paisIso: 'CO',
    dias: 4,
    noches: 3,
    planAlimentacion: 'DESAYUNO',
    mayoristaId: OPERADORA_ANDINA.id,
    activo: false,
    descripcion:
      'Tarifario de demostración expirado para verificar las alertas de vigencia de tarifas y evitar cotizar con precios no vigentes.',
    inclusiones: ['Tiquetes aéreos', 'Hotel El Rodadero', 'Desayunos diarios'],
    exclusiones: ['Entrada Tayrona', 'Almuerzos'],
    creadoEn: '2026-01-01T08:00:00.000Z',
    mayorista: OPERADORA_ANDINA,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000b7', '2026-01-01', '2026-06-30', [
        tarifa('01932000-0000-7000-8000-0000000000dc', 'DOBLE', 'ADT', 800000, 990000, null, null),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000010',
    nombre: 'Pasadía Islas del Rosario & Barú VIP — Excursión 1 Día',
    destino: 'Cartagena',
    paisIso: 'CO',
    dias: 1,
    noches: 0,
    planAlimentacion: 'TODO_INCLUIDO',
    mayoristaId: MAYORISTA_CARIBE.id,
    activo: true,
    descripcion:
      'Excursión marítima de 1 día a las Islas del Rosario y Barú. Incluye lancha rápida desde muelle La Bodeguita, asoleadora en club de playa exclusivo y almuerzo caribeño típico.',
    inclusiones: [
      'Transporte marítimo ida y vuelta en lancha rápida desde muelle La Bodeguita',
      'Coctel de bienvenida caribeño',
      'Almuerzo típico (pescado frito o pollo, arroz de coco y patacones)',
      'Uso de asoleadora y carpa en playa privada',
      'Seguro de asistencia médica náutica',
    ],
    exclusiones: [
      'Impuesto de muelle ($26.500 COP por persona en taquilla antes de zarpar)',
      'Actividades de snorkel guiado o careteo',
      'Consumos personales adicionales',
    ],
    creadoEn: '2026-02-18T08:00:00.000Z',
    mayorista: MAYORISTA_CARIBE,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000e1', '2026-01-01', '2027-12-31', [
        tarifa('01932000-0000-7000-8000-0000000000f1', 'DOBLE', 'ADT', 195000, 260000, null, null),
        tarifa('01932000-0000-7000-8000-0000000000f2', 'DOBLE', 'CHD', 150000, 195000, 3, 10),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000011',
    nombre: 'Tour 5 Islas VIP con Snorkel y Plancton Luminoso — 1 Día',
    destino: 'Cartagena',
    paisIso: 'CO',
    dias: 1,
    noches: 0,
    planAlimentacion: 'PENSION_COMPLETA',
    mayoristaId: MAYORISTA_CARIBE.id,
    activo: true,
    descripcion:
      'El tour náutico insignia de Cartagena: visita Isla Grande, Cholón, Agua Azul, Playa Tranquila y avistamiento nocturno de plancton luminoso.',
    inclusiones: [
      'Recorrido completo en lancha rápida por 5 islas',
      'Equipo de careteo y snorkel con fotos subacuáticas',
      'Almuerzo típico caribeño gourmet',
      'Entrada a la laguna de plancton luminoso con guía',
      'Seguro de asistencia al viajero',
    ],
    exclusiones: [
      'Impuesto de muelle ($26.500 COP por persona en taquilla)',
      'Bebidas alcohólicas y propinas',
    ],
    creadoEn: '2026-02-18T09:00:00.000Z',
    mayorista: MAYORISTA_CARIBE,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000e2', '2026-01-01', '2027-12-31', [
        tarifa('01932000-0000-7000-8000-0000000000f3', 'DOBLE', 'ADT', 260000, 340000, null, null),
        tarifa('01932000-0000-7000-8000-0000000000f4', 'DOBLE', 'CHD', 210000, 270000, 3, 10),
      ]),
    ],
  },
  {
    id: '01932000-0000-7000-8000-000000000012',
    nombre: 'Pasadía Mambo Beach Club Barú — 1 Día',
    destino: 'Barú',
    paisIso: 'CO',
    dias: 1,
    noches: 0,
    planAlimentacion: 'MEDIA_PENSION',
    mayoristaId: OPERADORA_ANDINA.id,
    activo: true,
    descripcion:
      'Día de sol y playa en exclusivo club de Barú con música ambiental, camas balinesas y acceso a mar cristalino.',
    inclusiones: [
      'Transporte terrestre climatizado desde Cartagena',
      'Coctel de bienvenida',
      'Almuerzo a la carta con bono de consumo',
      'Uso de camas balinesas y duchas de agua dulce',
    ],
    exclusiones: ['Deportes náuticos', 'Consumos fuera del bono asignado'],
    creadoEn: '2026-02-18T10:00:00.000Z',
    mayorista: OPERADORA_ANDINA,
    vigencias: [
      vigencia('01932000-0000-7000-8000-0000000000e3', '2026-01-01', '2027-12-31', [
        tarifa('01932000-0000-7000-8000-0000000000f5', 'DOBLE', 'ADT', 165000, 220000, null, null),
      ]),
    ],
  },
];
