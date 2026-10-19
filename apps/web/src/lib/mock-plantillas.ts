import { PlantillasDisponibles, type PlantillaWhatsApp } from '@viajapro/contracts';

/**
 * Catálogo de plantillas Meta HSM registradas para ViajaPro.
 * Conforme 100% con los esquemas de @viajapro/contracts (PlantillaWhatsApp, PlantillasDisponibles).
 * Incluye plantillas APROBADAS (listas para enviar), PAUSADAS (por spam de Meta) y RECHAZADAS (para visibilidad).
 */
export function obtenerMockPlantillasDisponibles(): PlantillasDisponibles {
  const ahora = new Date().toISOString();

  const plantillas: PlantillaWhatsApp[] = [
    {
      id: '00000000-0020-4000-8000-000000000001',
      nombre: 'seguimiento_cotizacion_v1',
      idioma: 'es_CO',
      categoria: 'UTILIDAD',
      estado: 'APROBADA',
      motivoEstado: null,
      encabezado: 'Actualización de Cotización',
      cuerpo:
        'Hola {{1}}, quisiéramos saber si tuviste oportunidad de revisar la cotización para tu viaje a {{2}}. Quedamos atentos para resolver cualquier duda y ajustar las fechas si lo requieres.',
      pie: 'ViajaPro Asesoría',
      botones: [
        {
          tipo: 'RESPUESTA_RAPIDA',
          texto: 'Revisar cotización',
          valor: null,
        },
        {
          tipo: 'RESPUESTA_RAPIDA',
          texto: 'Ajustar fechas',
          valor: null,
        },
      ],
      variables: [
        {
          indice: 1,
          descripcion: 'Nombre del viajero',
          ejemplo: 'Juan',
        },
        {
          indice: 2,
          descripcion: 'Destino consultado',
          ejemplo: 'Cancún',
        },
      ],
      actualizadaEn: ahora,
    },
    {
      id: '00000000-0020-4000-8000-000000000002',
      nombre: 'recordatorio_anticipo_v1',
      idioma: 'es_CO',
      categoria: 'UTILIDAD',
      estado: 'APROBADA',
      motivoEstado: null,
      encabezado: 'Plazo Límite de Reserva',
      cuerpo:
        'Estimado/a {{1}}, le recordamos que el plazo para asegurar los cupos y la tarifa de su viaje vence el {{2}}. Responda a este mensaje para coordinar el pago o solicitar una prórroga con el mayorista.',
      pie: 'ViajaPro Pagos',
      botones: [
        {
          tipo: 'RESPUESTA_RAPIDA',
          texto: 'Pagar anticipo',
          valor: null,
        },
      ],
      variables: [
        {
          indice: 1,
          descripcion: 'Nombre del viajero',
          ejemplo: 'Ana',
        },
        {
          indice: 2,
          descripcion: 'Fecha de vencimiento',
          ejemplo: '25 de octubre',
        },
      ],
      actualizadaEn: ahora,
    },
    {
      id: '00000000-0020-4000-8000-000000000003',
      nombre: 'itinerario_emitido_v1',
      idioma: 'es_CO',
      categoria: 'UTILIDAD',
      estado: 'APROBADA',
      motivoEstado: null,
      encabezado: 'Documentos de Viaje Listos',
      cuerpo:
        'Hola {{1}}, tus vouchers de hotel y pases de abordar ya han sido confirmados por la aerolínea y el receptivo. ¿Deseas que te los compartamos de inmediato por este canal?',
      pie: 'ViajaPro Operaciones',
      botones: [
        {
          tipo: 'RESPUESTA_RAPIDA',
          texto: 'Enviar vouchers',
          valor: null,
        },
      ],
      variables: [
        {
          indice: 1,
          descripcion: 'Nombre del viajero',
          ejemplo: 'Carlos',
        },
      ],
      actualizadaEn: ahora,
    },
    {
      id: '00000000-0020-4000-8000-000000000004',
      nombre: 'promocion_black_friday_v1',
      idioma: 'es_CO',
      categoria: 'MARKETING',
      estado: 'PAUSADA',
      motivoEstado:
        'Pausada automáticamente por Meta debido a que múltiples destinatarios la marcaron como mensaje no deseado (tasa de quejas > 0.1%).',
      encabezado: 'Descuentos Exclusivos',
      cuerpo:
        'Aprovecha descuentos de hasta el 35% en paquetes al Caribe reservando esta semana. Cupos limitados para viajar en temporada baja.',
      pie: 'ViajaPro Promociones',
      botones: [],
      variables: [],
      actualizadaEn: ahora,
    },
    {
      id: '00000000-0020-4000-8000-000000000005',
      nombre: 'reactivacion_inactivos_v1',
      idioma: 'es_CO',
      categoria: 'MARKETING',
      estado: 'RECHAZADA',
      motivoEstado:
        'Rechazada por Meta: las plantillas de marketing deben incluir obligatoriamente una opción de respuesta rápida o texto para darse de baja (Opt-Out).',
      encabezado: null,
      cuerpo:
        'Hace tiempo no viajas con nosotros. Escríbenos para conocer los nuevos destinos de este año.',
      pie: null,
      botones: [],
      variables: [],
      actualizadaEn: ahora,
    },
  ];

  const aprobadas = plantillas.filter((p) => p.estado === 'APROBADA').length;

  return PlantillasDisponibles.parse({
    plantillas,
    aprobadas,
  });
}
