import { FichaDeContacto } from '@viajapro/contracts';

/**
 * Función mock para obtener la Ficha del Viajero por ID de conversación / contacto.
 * Conforme 100% con los esquemas de @viajapro/contracts (Contacto, Oportunidad, CotizacionResumen, Dinero).
 */
export function obtenerMockFichaDeContacto(conversacionId: string): FichaDeContacto {
  return {
    contacto: {
      id: `cont-${conversacionId.slice(0, 8)}`,
      nombre: 'Sofía Gómez',
      telefono: '+573001234567',
      correo: 'sofia.gomez@ejemplo.com',
      etiquetas: ['VIP', 'Familia', 'San Andrés'],
      preferencias: 'Prefiere hoteles 4+ estrellas frente al mar. Asientos de pasillo.',
      consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      creadoEn: '2026-01-15T10:00:00Z',
      ultimoContactoEn: '2026-10-10T14:30:00Z',
    },
    oportunidadActual: {
      id: 'op-9921',
      contactoId: `cont-${conversacionId.slice(0, 8)}`,
      contactoNombre: 'Sofía Gómez',
      titulo: 'Paquete Cancún Todo Incluido Diciembre',
      destino: 'Cancún, México',
      paqueteId: 'pkg-cancun-2026',
      fechaSalida: '2026-12-15',
      etapa: 'EN_COTIZACION',
      valorEstimado: {
        unidades: '1250000000', // 12.500.000 COP en centavos
        moneda: 'COP',
      },
      probabilidad: 80,
      asesorId: 'user-1',
      asesorNombre: 'Carlos Asesor',
      proximaTarea: {
        descripcion: 'Confirmar si requiere vuelos desde Medellín o Bogotá',
        venceEn: '2026-10-12T18:00:00Z',
        completada: false,
      },
      motivoPerdida: null,
      notaPerdida: null,
      creadaEn: '2026-10-01T15:00:00Z',
      ultimoContactoEn: '2026-10-10T14:30:00Z',
    },
    cotizaciones: [
      {
        id: 'cot-101',
        version: 2,
        titulo: 'Hotel Hard Rock + Vuelos Avianca (4 pax)',
        precioVenta: {
          unidades: '1250000000', // 12.500.000 COP
          moneda: 'COP',
        },
        vigenteHasta: '2026-10-20',
        enviadaEn: '2026-10-09T16:00:00Z',
      },
      {
        id: 'cot-100',
        version: 1,
        titulo: 'Hotel Riu Palace (4 pax)',
        precioVenta: {
          unidades: '1100000000', // 11.000.000 COP
          moneda: 'COP',
        },
        vigenteHasta: '2026-10-15',
        enviadaEn: '2026-10-05T11:00:00Z',
      },
    ],
    archivosDeViajeIds: ['TF-2026-8819', 'TF-2025-4012'],
    notasInternas: [
      {
        id: 'nota-1',
        autorNombre: 'Carlos Asesor',
        texto: 'Cliente muy interesado en viajar antes del 20 de diciembre. Viaja con 2 niños.',
        escritaEn: '2026-10-08T09:30:00Z',
      },
    ],
  };
}
