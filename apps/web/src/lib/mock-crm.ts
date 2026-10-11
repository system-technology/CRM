import { FichaDeContacto } from '@viajapro/contracts';
import { MOCK_CONVERSACIONES } from './mock-inbox';

function hashCadena(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Función mock para obtener la Ficha del Viajero por ID de conversación.
 * Atada estrictamente a la conversación solicitada (0d).
 * Conforme 100% con los esquemas de @viajapro/contracts (FichaDeContacto, Contacto, Oportunidad, etc.).
 */
export function obtenerMockFichaDeContacto(conversacionId: string): FichaDeContacto {
  const conv = MOCK_CONVERSACIONES.find((c) => c.id === conversacionId);

  // Derivar datos si la conversación no está en la lista estándar
  const hash = hashCadena(conversacionId);
  const contactoId =
    conv?.contactoId ??
    `00000000-0002-4000-8000-${hash.toString(16).padStart(12, '0').slice(0, 12)}`;
  const nombre = conv?.contactoNombre ?? (conv ? null : 'Viajero Simulado');
  const telefono = conv?.contactoTelefono ?? `+57300${((hash % 9000000) + 1000000).toString()}`;
  const etiquetas = conv?.etiquetas && conv.etiquetas.length > 0 ? conv.etiquetas : ['Lead Nuevo'];

  const fichaSinValidar = {
    contacto: {
      id: contactoId,
      nombre,
      telefono,
      correo: nombre ? `${nombre.toLowerCase().replace(/[^a-z0-9]/g, '.')}@ejemplo.com` : null,
      etiquetas,
      preferencias: 'Prefiere hoteles 4+ estrellas frente al mar. Asientos de pasillo.',
      consentimientos: ['TRANSACCIONAL' as const, 'PROMOCIONAL' as const],
      creadoEn: '2026-01-15T10:00:00.000Z',
      ultimoContactoEn: conv?.ultimoMensajeEn ?? '2026-10-10T14:30:00.000Z',
    },
    oportunidadActual: {
      id: `00000000-0003-4000-8000-${hash.toString(16).padStart(12, '0').slice(0, 12)}`,
      contactoId,
      contactoNombre: nombre,
      titulo: nombre ? `Paquete Vacacional para ${nombre}` : 'Paquete Vacacional Caribe',
      destino: 'Cancún, México',
      paqueteId: null,
      fechaSalida: '2026-12-15',
      etapa: {
        id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
        clave: 'EN_COTIZACION' as const,
        nombre: 'En cotización',
        orden: 2,
        probabilidad: 40,
        esGanada: false,
        esPerdida: false,
      },
      valorEstimado: {
        unidades: '1250000000', // 12.500.000 COP en centavos
        moneda: 'COP' as const,
      },
      probabilidad: 80,
      asesorId: conv?.asignadoAId ?? '00000000-0000-4000-a000-000000000001',
      asesorNombre: conv?.asignadoANombre ?? 'Carlos Asesor',
      proximaTarea: {
        descripcion: 'Confirmar si requiere vuelos desde Medellín o Bogotá',
        venceEn: '2026-10-12T18:00:00.000Z',
        completada: false,
      },
      motivoPerdida: null,
      notaPerdida: null,
      creadaEn: '2026-10-01T15:00:00.000Z',
      ultimoContactoEn: conv?.ultimoMensajeEn ?? '2026-10-10T14:30:00.000Z',
    },
    cotizaciones: [
      {
        id: `00000000-0004-4000-8000-${(hash + 1).toString(16).padStart(12, '0').slice(0, 12)}`,
        version: 2,
        titulo: 'Hotel Hard Rock + Vuelos Avianca (4 pax)',
        precioVenta: {
          unidades: '1250000000',
          moneda: 'COP' as const,
        },
        vigenteHasta: '2026-10-20',
        enviadaEn: '2026-10-09T16:00:00.000Z',
      },
      {
        id: `00000000-0004-4000-8000-${(hash + 2).toString(16).padStart(12, '0').slice(0, 12)}`,
        version: 1,
        titulo: 'Hotel Riu Palace (4 pax)',
        precioVenta: {
          unidades: '1100000000',
          moneda: 'COP' as const,
        },
        vigenteHasta: '2026-10-15',
        enviadaEn: '2026-10-05T11:00:00.000Z',
      },
    ],
    archivosDeViajeIds: [
      `00000000-0005-4000-8000-${(hash + 1).toString(16).padStart(12, '0').slice(0, 12)}`,
      `00000000-0005-4000-8000-${(hash + 2).toString(16).padStart(12, '0').slice(0, 12)}`,
    ],
    notasInternas: [
      {
        id: `00000000-0006-4000-8000-${hash.toString(16).padStart(12, '0').slice(0, 12)}`,
        autorNombre: conv?.asignadoANombre ?? 'Carlos Asesor',
        texto: 'Cliente muy interesado en viajar antes del 20 de diciembre. Viaja con 2 niños.',
        escritaEn: '2026-10-08T09:30:00.000Z',
      },
    ],
  };

  return FichaDeContacto.parse(fichaSinValidar);
}
