import { TableroPipeline, type ColumnaPipeline } from '@viajapro/contracts';

/**
 * Fuente de datos simulada para el Tablero Kanban de Pipeline (/pipeline).
 * Invariante: Conforme 100% con @viajapro/contracts (TableroPipeline, ColumnaPipeline, Oportunidad).
 * El total de la columna viene precalculado del servidor y no es la suma de las tarjetas visibles (COLA-DESPUES §0c.3).
 */
export function obtenerMockTableroPipeline(): TableroPipeline {
  // Base temporal redondeada a la hora actual para evitar desfases milimétricos de hidratación SSR
  const ahora = Math.floor(Date.now() / 3600000) * 3600000;

  const columnas: ColumnaPipeline[] = [
    // 1. NUEVO_LEAD
    {
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
        clave: 'NUEVO_LEAD',
        nombre: 'Consulta nueva',
        orden: 1,
        probabilidad: 10,
        esGanada: false,
        esPerdida: false,
      },
      total: 3,
      valorTotal: {
        unidades: '18500000', // 18.500.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
            clave: 'NUEVO_LEAD',
            nombre: 'Consulta nueva',
            orden: 1,
            probabilidad: 10,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '6200000', moneda: 'COP' }, // 6.200.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
            clave: 'NUEVO_LEAD',
            nombre: 'Consulta nueva',
            orden: 1,
            probabilidad: 10,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '4800000', moneda: 'COP' }, // 4.800.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
            clave: 'NUEVO_LEAD',
            nombre: 'Consulta nueva',
            orden: 1,
            probabilidad: 10,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '7500000', moneda: 'COP' }, // 7.500.000 COP
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
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
        clave: 'EN_COTIZACION',
        nombre: 'En cotización',
        orden: 2,
        probabilidad: 40,
        esGanada: false,
        esPerdida: false,
      },
      total: 2,
      valorTotal: {
        unidades: '28300000', // 28.300.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
            clave: 'EN_COTIZACION',
            nombre: 'En cotización',
            orden: 2,
            probabilidad: 40,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '12500000', moneda: 'COP' }, // 12.500.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
            clave: 'EN_COTIZACION',
            nombre: 'En cotización',
            orden: 2,
            probabilidad: 40,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '15800000', moneda: 'COP' }, // 15.800.000 COP
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
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a03',
        clave: 'EN_NEGOCIACION',
        nombre: 'En negociación',
        orden: 3,
        probabilidad: 70,
        esGanada: false,
        esPerdida: false,
      },
      total: 2,
      valorTotal: {
        unidades: '23500000', // 23.500.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a03',
            clave: 'EN_NEGOCIACION',
            nombre: 'En negociación',
            orden: 3,
            probabilidad: 70,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '9500000', moneda: 'COP' }, // 9.500.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a03',
            clave: 'EN_NEGOCIACION',
            nombre: 'En negociación',
            orden: 3,
            probabilidad: 70,
            esGanada: false,
            esPerdida: false,
          },
          valorEstimado: { unidades: '14000000', moneda: 'COP' }, // 14.000.000 COP
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
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a04',
        clave: 'GANADA',
        nombre: 'Ganada',
        orden: 4,
        probabilidad: 100,
        esGanada: true,
        esPerdida: false,
      },
      total: 1,
      valorTotal: {
        unidades: '16200000', // 16.200.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a04',
            clave: 'GANADA',
            nombre: 'Ganada',
            orden: 4,
            probabilidad: 100,
            esGanada: true,
            esPerdida: false,
          },
          valorEstimado: { unidades: '16200000', moneda: 'COP' }, // 16.200.000 COP
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
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a05',
        clave: 'PERDIDA',
        nombre: 'Perdida',
        orden: 5,
        probabilidad: 0,
        esGanada: false,
        esPerdida: true,
      },
      total: 1,
      valorTotal: {
        unidades: '8900000', // 8.900.000 COP
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
          etapa: {
            id: '01a114b2-5314-75b1-91ad-3be0518a6a05',
            clave: 'PERDIDA',
            nombre: 'Perdida',
            orden: 5,
            probabilidad: 0,
            esGanada: false,
            esPerdida: true,
          },
          valorEstimado: { unidades: '8900000', moneda: 'COP' }, // 8.900.000 COP
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
