import type { TipoPasajero } from '@viajapro/contracts';

/**
 * Mock data y tipos del Expediente Operativo / Archivo de Viaje (TravelFile).
 *
 * Conforme a viajapro_diseno_ui_ux.json (Pantalla P1: travel_file),
 * docs/01-producto/02-lenguaje-ubicuo.md (TravelFile, Booking, recordLocator, timeLimit, Supplier),
 * R8 (Dinero en unidades enteras de COP), R9 (Fechas UTC) y R10 (Protección de PII).
 */

export type EstadoArchivoViaje =
  'CONFIRMADO' | 'EN_OPERACION' | 'VIAJANDO' | 'COMPLETADO' | 'CANCELADO';

export type EstadoDocumento = 'CARGADO' | 'PENDIENTE' | 'RECHAZADO' | 'VERIFICADO';

export interface PasajeroViaje {
  id: string;
  nombreCompleto: string;
  tipo: TipoPasajero;
  documentoTipo: 'CC' | 'PASAPORTE' | 'TI';
  documentoNumero: string; // Enmascarada en UI para R10: CC-***842
  fechaNacimiento: string;
  nacionalidad: string;
  estadoDocumentos: EstadoDocumento;
  tieneVoucher: boolean;
}

export type TipoServicioBooking = 'VUELO' | 'HOTEL' | 'TRASLADO' | 'EXCURSION' | 'SEGURO';
export type EstadoBooking = 'CONFIRMADA' | 'EMITIDA' | 'PENDIENTE_PAGO' | 'CANCELADA';

export interface ReservaProveedor {
  id: string;
  tipo: TipoServicioBooking;
  proveedorNombre: string;
  localizador: string; // PNR o locator oficial
  descripcion: string;
  timeLimitUtc: string; // Fecha y hora límite antes de perder la reserva
  costoNetoCop: number; // En pesos colombianos (entero)
  estado: EstadoBooking;
  voucherUrl?: string;
}

export type MetodoPago = 'TRANSFERENCIA' | 'TARJETA' | 'WOMPI' | 'EFECTIVO';

export interface PagoAbono {
  id: string;
  fechaUtc: string;
  montoCop: number;
  metodo: MetodoPago;
  referenciaComprobante: string;
  registradoPor: string;
}

export interface DiaItinerario {
  dia: number;
  fecha: string;
  titulo: string;
  descripcion: string;
  horario?: string;
  servicios: string[];
}

export interface ArchivoDeViaje {
  id: string;
  codigoExpediente: string;
  titularNombre: string;
  titularTelefono: string;
  titularEmail: string;
  destino: string;
  fechaSalida: string;
  fechaRegreso: string;
  paqueteNombre: string;
  estado: EstadoArchivoViaje;
  totalVentaCop: number; // Entero en COP
  totalPagadoCop: number; // Entero en COP
  asesorAsignado: string;
  pasajeros: PasajeroViaje[];
  reservas: ReservaProveedor[];
  pagos: PagoAbono[];
  itinerario: DiaItinerario[];
  notasOperativas: {
    id: string;
    autor: string;
    texto: string;
    fechaUtc: string;
  }[];
}

export const MOCK_ARCHIVOS_VIAJE: ArchivoDeViaje[] = [
  {
    id: '01932000-0000-7000-8000-0000000000e1',
    codigoExpediente: 'EXP-2026-1042',
    titularNombre: 'Felipe Morales Restrepo',
    titularTelefono: '+573001234504',
    titularEmail: 'felipe.morales@ejemplo.com',
    destino: 'San Andrés Islas, Colombia',
    fechaSalida: '2026-11-20',
    fechaRegreso: '2026-11-25',
    paqueteNombre: 'San Andrés Todo Incluido Familiar (Decameron)',
    estado: 'EN_OPERACION',
    totalVentaCop: 6200000,
    totalPagadoCop: 3500000,
    asesorAsignado: 'Carlos Asesor',
    pasajeros: [
      {
        id: '01932000-0000-7000-8000-0000000000f1',
        nombreCompleto: 'Felipe Morales Restrepo',
        tipo: 'ADT',
        documentoTipo: 'CC',
        documentoNumero: '1020304050',
        fechaNacimiento: '1988-06-14',
        nacionalidad: 'Colombiana',
        estadoDocumentos: 'VERIFICADO',
        tieneVoucher: true,
      },
      {
        id: '01932000-0000-7000-8000-0000000000f2',
        nombreCompleto: 'Claudia Mejía Zuluaga',
        tipo: 'ADT',
        documentoTipo: 'CC',
        documentoNumero: '1030405060',
        fechaNacimiento: '1990-11-22',
        nacionalidad: 'Colombiana',
        estadoDocumentos: 'VERIFICADO',
        tieneVoucher: true,
      },
      {
        id: '01932000-0000-7000-8000-0000000000f3',
        nombreCompleto: 'Mateo Morales Mejía',
        tipo: 'CHD',
        documentoTipo: 'TI',
        documentoNumero: '1120304050',
        fechaNacimiento: '2018-04-05',
        nacionalidad: 'Colombiana',
        estadoDocumentos: 'PENDIENTE',
        tieneVoucher: false,
      },
    ],
    reservas: [
      {
        id: '01932000-0000-7000-8000-000000000101',
        tipo: 'HOTEL',
        proveedorNombre: 'Decameron Hotels & Resorts',
        localizador: 'DEC-89412',
        descripcion: 'Habitación Superior Triple Vista Mar - Todo Incluido (5 noches)',
        timeLimitUtc: '2026-10-15T23:59:00Z',
        costoNetoCop: 3200000,
        estado: 'CONFIRMADA',
        voucherUrl: 'https://cdn.viajapro.com/vouchers/dec-89412.pdf',
      },
      {
        id: '01932000-0000-7000-8000-000000000102',
        tipo: 'VUELO',
        proveedorNombre: 'Avianca Airlines',
        localizador: 'AV-7X9K2L',
        descripcion: 'Vuelos BOG-ADZ-BOG cupo bloqueado familia Morales (3 pax)',
        timeLimitUtc: '2026-10-12T18:00:00Z', // VENCE HOY/PRONTO!
        costoNetoCop: 1800000,
        estado: 'PENDIENTE_PAGO',
      },
      {
        id: '01932000-0000-7000-8000-000000000103',
        tipo: 'TRASLADO',
        proveedorNombre: 'San Andrés Receptivos SAS',
        localizador: 'REC-5512',
        descripcion: 'Traslados aeropuerto - hotel - aeropuerto compartidos',
        timeLimitUtc: '2026-11-10T12:00:00Z',
        costoNetoCop: 250000,
        estado: 'CONFIRMADA',
      },
    ],
    pagos: [
      {
        id: '01932000-0000-7000-8000-000000000201',
        fechaUtc: '2026-10-01T15:30:00Z',
        montoCop: 2000000,
        metodo: 'TRANSFERENCIA',
        referenciaComprobante: 'BANCOLOMBIA-TRANSF-98412',
        registradoPor: 'Carlos Asesor',
      },
      {
        id: '01932000-0000-7000-8000-000000000202',
        fechaUtc: '2026-10-08T11:20:00Z',
        montoCop: 1500000,
        metodo: 'WOMPI',
        referenciaComprobante: 'WOMPI-TX-778844',
        registradoPor: 'Carlos Asesor',
      },
    ],
    itinerario: [
      {
        dia: 1,
        fecha: '2026-11-20',
        titulo: 'Llegada y bienvenida al mar de siete colores',
        descripcion:
          'Vuelo Avianca BOG-ADZ llegada 10:30 AM. Traslado al Decameron San Luis. Check-in y tarde libre de playa.',
        servicios: ['Vuelo de ida', 'Traslado aeropuerto-hotel', 'Check-in Todo Incluido'],
      },
      {
        dia: 2,
        fecha: '2026-11-21',
        titulo: 'Vuelta a la isla en Chiva típica y Hoyo Soplador',
        descripcion:
          'Tour panorámico por la mañana con paradas en Piscina Natural y Cueva de Morgan.',
        servicios: ['Tour panorámico con guía local'],
      },
      {
        dia: 3,
        fecha: '2026-11-22',
        titulo: 'Excursión a Johnny Cay y Acuario',
        descripcion: 'Día completo de playa en cayo coralino con almuerzo caribeño incluido.',
        servicios: ['Lancha rápida', 'Almuerzo de pescado frito'],
      },
      {
        dia: 4,
        fecha: '2026-11-23',
        titulo: 'Día libre de relajación y compras en el centro libre de impuestos',
        descripcion: 'Disfrute de instalaciones del resort y tarde libre en North End.',
        servicios: ['Día libre de playa y compras'],
      },
      {
        dia: 5,
        fecha: '2026-11-25',
        titulo: 'Regreso a Bogotá',
        descripcion:
          'Check-out a las 12:00 PM. Traslado al aeropuerto Gustavo Rojas Pinilla para vuelo de regreso a las 15:45 PM.',
        servicios: ['Traslado hotel-aeropuerto', 'Vuelo de regreso'],
      },
    ],
    notasOperativas: [
      {
        id: '01932000-0000-7000-8000-000000000301',
        autor: 'Carlos Asesor',
        texto: 'Cliente solicitó cuna para Mateo y habitación en planta baja si es posible.',
        fechaUtc: '2026-10-01T15:35:00Z',
      },
      {
        id: '01932000-0000-7000-8000-000000000302',
        autor: 'Carlos Asesor',
        texto:
          'AVISO: Time limit de Avianca vence pronto. Se requiere confirmar pago restante del cliente antes de emitir los tiquetes.',
        fechaUtc: '2026-10-10T09:00:00Z',
      },
    ],
  },
  {
    id: '01932000-0000-7000-8000-0000000000e2',
    codigoExpediente: 'EXP-2026-1043',
    titularNombre: 'Diana Marcela Ramírez',
    titularTelefono: '+573001234505',
    titularEmail: 'diana.ramirez@ejemplo.com',
    destino: 'Cancún y Riviera Maya, México',
    fechaSalida: '2026-12-15',
    fechaRegreso: '2026-12-21',
    paqueteNombre: 'Riviera Maya All Inclusive Romance (Hard Rock Hotel)',
    estado: 'CONFIRMADO',
    totalVentaCop: 12500000,
    totalPagadoCop: 12500000,
    asesorAsignado: 'Carlos Asesor',
    pasajeros: [
      {
        id: '01932000-0000-7000-8000-0000000000f4',
        nombreCompleto: 'Diana Marcela Ramírez',
        tipo: 'ADT',
        documentoTipo: 'PASAPORTE',
        documentoNumero: 'PA987654321',
        fechaNacimiento: '1992-03-18',
        nacionalidad: 'Colombiana',
        estadoDocumentos: 'VERIFICADO',
        tieneVoucher: true,
      },
      {
        id: '01932000-0000-7000-8000-0000000000f5',
        nombreCompleto: 'Andrés Gómez Silva',
        tipo: 'ADT',
        documentoTipo: 'PASAPORTE',
        documentoNumero: 'PA876543210',
        fechaNacimiento: '1989-08-30',
        nacionalidad: 'Colombiana',
        estadoDocumentos: 'VERIFICADO',
        tieneVoucher: true,
      },
    ],
    reservas: [
      {
        id: '01932000-0000-7000-8000-000000000104',
        tipo: 'HOTEL',
        proveedorNombre: 'Hard Rock Hotel Riviera Maya',
        localizador: 'HRH-104921',
        descripcion: 'Deluxe Gold King - Todo Incluido con amenidad de aniversario',
        timeLimitUtc: '2026-11-20T23:59:00Z',
        costoNetoCop: 7800000,
        estado: 'EMITIDA',
        voucherUrl: 'https://cdn.viajapro.com/vouchers/hrh-104921.pdf',
      },
      {
        id: '01932000-0000-7000-8000-000000000105',
        tipo: 'VUELO',
        proveedorNombre: 'Copa Airlines',
        localizador: 'CM-9B3K1P',
        descripcion: 'Vuelos BOG-PTY-CUN-PTY-BOG (2 pax)',
        timeLimitUtc: '2026-11-15T23:59:00Z',
        costoNetoCop: 3100000,
        estado: 'EMITIDA',
        voucherUrl: 'https://cdn.viajapro.com/vouchers/copa-9b3k1p.pdf',
      },
    ],
    pagos: [
      {
        id: '01932000-0000-7000-8000-000000000203',
        fechaUtc: '2026-09-25T14:00:00Z',
        montoCop: 6000000,
        metodo: 'TRANSFERENCIA',
        referenciaComprobante: 'TRF-BANCOLOMBIA-44312',
        registradoPor: 'Carlos Asesor',
      },
      {
        id: '01932000-0000-7000-8000-000000000204',
        fechaUtc: '2026-10-05T16:45:00Z',
        montoCop: 6500000,
        metodo: 'TARJETA',
        referenciaComprobante: 'VISA-AUTH-99120',
        registradoPor: 'Carlos Asesor',
      },
    ],
    itinerario: [
      {
        dia: 1,
        fecha: '2026-12-15',
        titulo: 'Vuelo a Cancún y traslado a Riviera Maya',
        descripcion:
          'Salida de Bogotá con escala en Panamá. Recepción en el aeropuerto de Cancún y traslado privado.',
        servicios: ['Vuelo Copa Airlines', 'Traslado privado en camioneta SUV'],
      },
      {
        dia: 2,
        fecha: '2026-12-16',
        titulo: 'Día de descanso en resort',
        descripcion:
          'Disfrute de piscinas exclusivas y playa privada con amenidad de botella de vino.',
        servicios: ['Todo incluido gourmet'],
      },
    ],
    notasOperativas: [
      {
        id: '01932000-0000-7000-8000-000000000303',
        autor: 'Carlos Asesor',
        texto: 'Expediente totalmente pagado y emitido. Vouchers enviados al cliente por WhatsApp.',
        fechaUtc: '2026-10-05T17:00:00Z',
      },
    ],
  },
];
