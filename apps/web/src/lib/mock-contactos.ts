import { PaginaContactos, type Contacto } from '@viajapro/contracts';

/**
 * Fuente de datos simulada para el Directorio de Contactos y Viajeros (/contactos).
 * Conforme 100% con @viajapro/contracts (Contacto, PaginaContactos).
 */
export function obtenerMockPaginaContactos(): PaginaContactos {
  const ahora = new Date().toISOString();

  const contactos: Contacto[] = [
    {
      id: '00000000-0002-4000-8000-000000000001',
      nombre: 'Juan Pérez',
      telefono: '+573000012345',
      correo: 'juan.perez@ejemplo.com',
      etiquetas: ['VIP', 'Familia', 'Cancún'],
      preferencias: 'Prefiere hoteles 5 estrellas frente al mar y vuelos matutinos de Avianca.',
      consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      creadoEn: '2026-01-15T10:00:00.000Z',
      ultimoContactoEn: ahora,
    },
    {
      id: '00000000-0002-4000-8000-000000000002',
      nombre: 'Ana Martínez',
      telefono: '+573000024690',
      correo: 'ana.martinez@ejemplo.com',
      etiquetas: ['Curazao', 'Pareja'],
      preferencias: 'Asientos de pasillo en vuelos internacionales. Régimen Todo Incluido.',
      consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      creadoEn: '2026-02-10T14:30:00.000Z',
      ultimoContactoEn: ahora,
    },
    {
      id: '00000000-0002-4000-8000-000000000003',
      nombre: 'Sonia López',
      telefono: '+573000037035',
      correo: 'sonia.lopez@ejemplo.com',
      etiquetas: ['San Andrés'],
      preferencias:
        'Planes con traslados aeropuerto-hotel incluidos y asistencia médica internacional.',
      consentimientos: ['TRANSACCIONAL'],
      creadoEn: '2026-03-01T09:15:00.000Z',
      ultimoContactoEn: '2026-10-08T16:00:00.000Z',
    },
    {
      id: '00000000-0002-4000-8000-000000000004',
      nombre: 'Felipe Morales',
      telefono: '+573000049380',
      correo: 'felipe.morales@ejemplo.com',
      etiquetas: ['Familia', 'San Andrés'],
      preferencias: 'Viaja con 2 niños pequeños; solicita habitaciones comunicadas o familiares.',
      consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      creadoEn: '2026-04-12T11:20:00.000Z',
      ultimoContactoEn: '2026-10-10T12:00:00.000Z',
    },
    {
      id: '00000000-0002-4000-8000-000000000005',
      nombre: 'Diana Ramírez',
      telefono: '+573000061725',
      correo: 'diana.ramirez@ejemplo.com',
      etiquetas: ['Cartagena', 'Luna de Miel'],
      preferencias:
        'Paquete luna de miel con cena romántica en la playa y amenidades de bienvenida.',
      consentimientos: ['TRANSACCIONAL'],
      creadoEn: '2026-05-20T16:45:00.000Z',
      ultimoContactoEn: '2026-10-09T18:30:00.000Z',
    },
    {
      id: '00000000-0002-4000-8000-000000000006',
      nombre: 'Camilo Torres',
      telefono: '+573000074070',
      correo: 'camilo.torres@ejemplo.com',
      etiquetas: ['Punta Cana', 'Corporativo'],
      preferencias:
        'Facturación electrónica a nombre de empresa; exige seguro con cobertura de cancelación.',
      consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      creadoEn: '2026-06-18T08:00:00.000Z',
      ultimoContactoEn: '2026-10-07T10:00:00.000Z',
    },
    {
      id: '00000000-0002-4000-8000-000000000007',
      nombre: 'Valentina Ríos',
      telefono: '+573000086415',
      correo: 'valentina.rios@ejemplo.com',
      etiquetas: ['Europa'],
      preferencias: 'Circuitos guiados en español, hoteles céntricos cerca de estaciones de metro.',
      consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
      creadoEn: '2026-07-04T15:10:00.000Z',
      ultimoContactoEn: '2026-10-10T09:00:00.000Z',
    },
    {
      id: '00000000-0002-4000-8000-000000000008',
      nombre: 'Santiago Castro',
      telefono: '+573000098760',
      correo: 'santiago.castro@ejemplo.com',
      etiquetas: ['Orlando', 'Familia'],
      preferencias: 'Entradas Park Hopper y vehículo de renta con seguro total (LDW/CDW).',
      consentimientos: ['TRANSACCIONAL'],
      creadoEn: '2026-08-11T13:40:00.000Z',
      ultimoContactoEn: '2026-10-05T14:20:00.000Z',
    },
  ];

  return PaginaContactos.parse({
    datos: contactos,
    pageInfo: {
      nextCursor: null,
      hasMore: false,
    },
  });
}
