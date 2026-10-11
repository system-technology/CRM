import { TableroPipeline, type ColumnaPipeline } from '@viajapro/contracts';

/**
 * Fuente de datos simulada para el Tablero Kanban de Pipeline (/pipeline).
 * Invariante: Conforme 100% con @viajapro/contracts (TableroPipeline, ColumnaPipeline, Oportunidad).
 * El total de la columna viene precalculado del servidor y no es la suma de las tarjetas visibles (COLA-DESPUES §0c.3).
 */
export function obtenerMockTableroPipeline(): TableroPipeline {
  const ahora = Date.now();

  const columnas: ColumnaPipeline[] = [
    // 1. NUEVO_LEAD
    {
      etapa: 'NUEVO_LEAD',
      total: 3,
      valorTotal: {
        unidades: '1850000000', // 18.500.000 COP
        moneda: 'COP',
      },
      oportunidades: [
        {
          id: '00000000-0010-4000-8000-000000000001',
          contactoId: '00000000-0002-4000-8000-000000000004',
          contactoNombre: 'Felipe Morales',
          titulo: 'Paquete San Andrés Todo Incluido Familiar',
          destino: 'San Andrés Islas, Colombia',
          paqueteId: null,
          fechaSalida: '2026-11-20',
          etapa: 'NUEVO_LEAD',
          valorEstimado: { unidades: '620000000', moneda: 'COP' }, // 6.200.000 COP
          probabilidad: 20,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: {
            descripcion: 'Enviar primer contacto por WhatsApp con opciones hoteleras',
            venceEn: new Date(ahora + 2 * 3600000).toISOString(),
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 3 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 3 * 3600000).toISOString(),
        },
        {
          id: '00000000-0010-4000-8000-000000000002',
          contactoId: '00000000-0002-4000-8000-000000000005',
          contactoNombre: 'Diana Ramírez',
          titulo: 'Escapada Romántica Cartagena 4D/3N',
          destino: 'Cartagena de Indias',
          paqueteId: null,
          fechaSalida: '2026-12-05',
          etapa: 'NUEVO_LEAD',
          valorEstimado: { unidades: '480000000', moneda: 'COP' }, // 4.800.000 COP
          probabilidad: 25,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: {
            descripcion: 'Llamar para perfilar fechas exactas de vuelo',
            venceEn: new Date(ahora - 1 * 3600000).toISOString(), // Atrasada!
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 12 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 12 * 3600000).toISOString(),
        },
        {
          id: '00000000-0010-4000-8000-000000000003',
          contactoId: '00000000-0002-4000-8000-000000000006',
          contactoNombre: 'Camilo Torres',
          titulo: 'Punta Cana Resort 5 Estrellas (2 Adultos)',
          destino: 'Punta Cana, Rep. Dominicana',
          paqueteId: null,
          fechaSalida: '2027-01-10',
          etapa: 'NUEVO_LEAD',
          valorEstimado: { unidades: '750000000', moneda: 'COP' }, // 7.500.000 COP
          probabilidad: 15,
          asesorId: '00000000-0000-4000-a000-000000000002',
          asesorNombre: 'Laura Gómez',
          proximaTarea: {
            descripcion: 'Confirmar si tienen pasaporte vigente',
            venceEn: new Date(ahora + 24 * 3600000).toISOString(),
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 18 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 18 * 3600000).toISOString(),
        },
      ],
    },

    // 2. EN_COTIZACION
    {
      etapa: 'EN_COTIZACION',
      total: 2,
      valorTotal: {
        unidades: '2830000000', // 28.300.000 COP
        moneda: 'COP',
      },
      oportunidades: [
        {
          id: '00000000-0010-4000-8000-000000000004',
          contactoId: '00000000-0002-4000-8000-000000000001',
          contactoNombre: 'Juan Pérez',
          titulo: 'Cancún Todo Incluido Diciembre (2 ad + 2 niñ)',
          destino: 'Cancún, México',
          paqueteId: null,
          fechaSalida: '2026-12-15',
          etapa: 'EN_COTIZACION',
          valorEstimado: { unidades: '1250000000', moneda: 'COP' }, // 12.500.000 COP
          probabilidad: 60,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: {
            descripcion: 'Enviar versión 2 de cotización con hotel Hard Rock',
            venceEn: new Date(ahora + 4 * 3600000).toISOString(),
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 48 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 2 * 3600000).toISOString(),
        },
        {
          id: '00000000-0010-4000-8000-000000000005',
          contactoId: '00000000-0002-4000-8000-000000000007',
          contactoNombre: 'Valentina Ríos',
          titulo: 'Circuito Europa Clásica 15 Días',
          destino: 'Madrid, París, Roma',
          paqueteId: null,
          fechaSalida: '2027-04-12',
          etapa: 'EN_COTIZACION',
          valorEstimado: { unidades: '1580000000', moneda: 'COP' }, // 15.800.000 COP
          probabilidad: 50,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: {
            descripcion: 'Confirmar itinerario de trenes de alta velocidad',
            venceEn: new Date(ahora + 8 * 3600000).toISOString(),
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 36 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 6 * 3600000).toISOString(),
        },
      ],
    },

    // 3. EN_NEGOCIACION
    {
      etapa: 'EN_NEGOCIACION',
      total: 2,
      valorTotal: {
        unidades: '2350000000', // 23.500.000 COP
        moneda: 'COP',
      },
      oportunidades: [
        {
          id: '00000000-0010-4000-8000-000000000006',
          contactoId: '00000000-0002-4000-8000-000000000002',
          contactoNombre: 'Ana Martínez',
          titulo: 'Curazao All Inclusive Beach Resort',
          destino: 'Willemstad, Curazao',
          paqueteId: null,
          fechaSalida: '2026-11-28',
          etapa: 'EN_NEGOCIACION',
          valorEstimado: { unidades: '950000000', moneda: 'COP' }, // 9.500.000 COP
          probabilidad: 80,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: {
            descripcion: 'Enviar enlace de pasarela de pago para el anticipo del 30%',
            venceEn: new Date(ahora + 1 * 3600000).toISOString(),
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 72 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 1 * 3600000).toISOString(),
        },
        {
          id: '00000000-0010-4000-8000-000000000007',
          contactoId: '00000000-0002-4000-8000-000000000008',
          contactoNombre: 'Santiago Castro',
          titulo: 'Orlando Parques + Miami Beach (Familia 5)',
          destino: 'Orlando & Miami, USA',
          paqueteId: null,
          fechaSalida: '2027-02-15',
          etapa: 'EN_NEGOCIACION',
          valorEstimado: { unidades: '1400000000', moneda: 'COP' }, // 14.000.000 COP
          probabilidad: 75,
          asesorId: '00000000-0000-4000-a000-000000000003',
          asesorNombre: 'Carlos Rodríguez',
          proximaTarea: {
            descripcion: 'Definir entradas a Universal vs Disney',
            venceEn: new Date(ahora + 5 * 3600000).toISOString(),
            completada: false,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 96 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 4 * 3600000).toISOString(),
        },
      ],
    },

    // 4. GANADA
    {
      etapa: 'GANADA',
      total: 1,
      valorTotal: {
        unidades: '1620000000', // 16.200.000 COP
        moneda: 'COP',
      },
      oportunidades: [
        {
          id: '00000000-0010-4000-8000-000000000008',
          contactoId: '00000000-0002-4000-8000-000000000009',
          contactoNombre: 'Andrea Gómez',
          titulo: 'Luna de Miel Riviera Maya 7D/6N',
          destino: 'Riviera Maya, México',
          paqueteId: null,
          fechaSalida: '2026-11-10',
          etapa: 'GANADA',
          valorEstimado: { unidades: '1620000000', moneda: 'COP' }, // 16.200.000 COP
          probabilidad: 100,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: {
            descripcion: 'Emitir TravelFile y enviar confirmación de vouchers',
            venceEn: new Date(ahora + 24 * 3600000).toISOString(),
            completada: true,
          },
          motivoPerdida: null,
          notaPerdida: null,
          creadaEn: new Date(ahora - 120 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 12 * 3600000).toISOString(),
        },
      ],
    },

    // 5. PERDIDA
    {
      etapa: 'PERDIDA',
      total: 1,
      valorTotal: {
        unidades: '890000000', // 8.900.000 COP
        moneda: 'COP',
      },
      oportunidades: [
        {
          id: '00000000-0010-4000-8000-000000000009',
          contactoId: '00000000-0002-4000-8000-000000000020',
          contactoNombre: 'Nicolás Medina',
          titulo: 'Punta Cana fin de año',
          destino: 'Punta Cana',
          paqueteId: null,
          fechaSalida: '2026-12-28',
          etapa: 'PERDIDA',
          valorEstimado: { unidades: '890000000', moneda: 'COP' }, // 8.900.000 COP
          probabilidad: 0,
          asesorId: '00000000-0000-4000-a000-000000000001',
          asesorNombre: 'Carlos Asesor',
          proximaTarea: null,
          motivoPerdida: 'PRECIO',
          notaPerdida: null,
          creadaEn: new Date(ahora - 160 * 3600000).toISOString(),
          ultimoContactoEn: new Date(ahora - 70 * 3600000).toISOString(),
        },
      ],
    },
  ];

  return TableroPipeline.parse({ columnas });
}
