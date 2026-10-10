/**
 * Datos simulados de la bandeja de conversaciones.
 *
 * **Archivo temporal para la rebanada vertical de frontend.**
 * Contiene 500 conversaciones generadas con variedad realista (SLA vencido, ventana 24h cerrada,
 * sin asignar, sin leer, nombres nulos) para verificar el rendimiento del renderizado en lista
 * y los filtros antes de contar con la API real.
 *
 * Fácil de remover una vez que se conecte el cliente HTTP real.
 */

import {
  ConversacionDetalle,
  ConversacionResumen,
  Mensaje,
  type AsignarConversacion,
  type CambiarEstadoConversacion,
  type ConsultarBandeja,
  type CrearNota,
  type EnviarTexto,
  type PaginaBandeja,
} from '@viajapro/contracts';

export const ID_ASESOR_ACTUAL = '00000000-0000-4000-a000-000000000001';
export const NOMBRE_ASESOR_ACTUAL = 'Asesor Actual';

export const ASESORES = [
  { id: ID_ASESOR_ACTUAL, nombre: NOMBRE_ASESOR_ACTUAL },
  { id: '00000000-0000-4000-a000-000000000002', nombre: 'Laura Gómez' },
  { id: '00000000-0000-4000-a000-000000000003', nombre: 'Carlos Rodríguez' },
  { id: '00000000-0000-4000-a000-000000000004', nombre: 'María Fernández' },
];

const NOMBRES_CONTACTOS = [
  'Juan Pérez',
  'Ana Martínez',
  'Sonia López',
  'Felipe Morales',
  'Diana Ramírez',
  'Camilo Torres',
  'Valentina Ríos',
  'Santiago Castro',
  'Andrea Gómez',
  'Alejandro Vargas',
  'Patricia Mendoza',
  'Gabriel Silva',
  'Natalia Herrera',
  'Daniel Ortiz',
  'Carolina Guerrero',
  'Esteban Benítez',
  'Lucía Paredes',
  'Mateo Salazar',
  'Isabella Restrepo',
  'Nicolás Medina',
];

const MENSAJES_EJEMPLO = [
  'Hola, quisiera cotizar un paquete a Cancún para 2 adultos y 2 niños en diciembre.',
  'Buenas tardes, ¿tienen disponibilidad para Punta Cana la próxima semana?',
  '¿Cuál es el valor total del paquete con tiquetes aéreos incluidos?',
  'Ya realicé el pago del anticipo, les adjunto el comprobante de transferencia.',
  'Perfecto, me queda claro. ¿A qué hora sale el vuelo de regreso?',
  '¿El hotel incluye todas las comidas y bebidas ilimitadas (Todo Incluido)?',
  'Hola, requiero ayuda urgente con un cambio de fecha en la reserva de mi viaje.',
  'Gracias por la información, lo reviso con mi familia y les confirmo mañana.',
  '¿Tienen opciones de financiación o pago en cuotas para este paquete?',
  'Buenas, necesito cancelar una reserva que hice ayer por un imprevisto.',
  '¿Qué documentos o vacunas se requieren para ingresar al destino?',
  'Confirmado. Por favor enviar los vouchers del hotel y los pases de abordar.',
];

const ETIQUETAS_OPCIONES = [
  ['Cotización', 'Cancún'],
  ['Punta Cana', 'VIP'],
  ['Vuelo', 'Urgente'],
  ['San Andrés'],
  ['Cartagena', 'Familia'],
  ['Luna de Miel'],
  ['Europa'],
  ['Pendiente Comprobante'],
];

/**
 * Genera un UUID v4 determinista en formato hexadecimal válido para Zod.
 */
function generarUuid(index: number, grupo: number = 1): string {
  const hexIdx = index.toString(16).padStart(12, '0');
  const hexGrp = grupo.toString(16).padStart(4, '0');
  return `00000000-${hexGrp}-4000-8000-${hexIdx}`;
}

/**
 * Genera 500 conversaciones variadas que cumplen el esquema Zod `ConversacionResumen`.
 */
function generar500Conversaciones(): ConversacionResumen[] {
  const ahora = Date.now();
  const lista: ConversacionResumen[] = [];

  for (let i = 1; i <= 500; i++) {
    const minHace = i * 4; // Distribución temporal escalonada
    const fechaMensaje = new Date(ahora - minHace * 60 * 1000).toISOString();

    // Reglas de variedad:
    const esMias = i % 4 === 1;
    const esSinAsignar = i % 4 === 0;
    const asesor = esSinAsignar ? null : esMias ? ASESORES[0] : ASESORES[i % ASESORES.length];

    // Variedad de nombre nulo (15% solo teléfono)
    const sinNombre = i % 7 === 0;
    const nombreContacto = sinNombre
      ? null
      : NOMBRES_CONTACTOS[i % NOMBRES_CONTACTOS.length] + ` (${i})`;
    const telefono = `+573${String(10000000 + i).padStart(8, '0')}`;

    // SLA:
    // - Vencido (en el pasado): ~20%
    // - Próximo a vencer (< 1 hora): ~15%
    // - Normal (> 1 hora en futuro): ~30%
    // - Sin SLA (null): ~35%
    let slaVenceEn: string | null = null;
    if (i % 5 === 1) {
      // Vencido
      slaVenceEn = new Date(ahora - ((i % 45) + 5) * 60 * 1000).toISOString();
    } else if (i % 5 === 2) {
      // Vence pronto (< 60m)
      slaVenceEn = new Date(ahora + ((i % 50) + 5) * 60 * 1000).toISOString();
    } else if (i % 5 === 3) {
      // Vence luego
      slaVenceEn = new Date(ahora + (i * 10 + 120) * 60 * 1000).toISOString();
    }

    // Ventana 24h de WhatsApp:
    // - Cerrada (expiró o no hay mensajes entrantes recientes): ~20%
    // - Por vencer (< 60m): ~15%
    // - Abierta: ~65%
    let ventanaAbierta = true;
    let expiraEnVentana: string | null;
    let minutosRestantesVentana: number | null;

    if (i % 5 === 0) {
      // Cerrada
      ventanaAbierta = false;
      minutosRestantesVentana = -(i * 3 + 10);
      expiraEnVentana = new Date(ahora + minutosRestantesVentana * 60 * 1000).toISOString();
    } else if (i % 7 === 3) {
      // Próxima a vencer (< 60m)
      minutosRestantesVentana = (i % 50) + 5;
      expiraEnVentana = new Date(ahora + minutosRestantesVentana * 60 * 1000).toISOString();
    } else {
      // Abierta holgada
      minutosRestantesVentana = 720 + (i % 600);
      expiraEnVentana = new Date(ahora + minutosRestantesVentana * 60 * 1000).toISOString();
    }

    const mensajesSinLeer = i % 3 === 0 ? (i % 7) + 1 : 0;
    const direccionMensaje = i % 2 === 0 ? 'ENTRANTE' : 'SALIENTE';
    const estadoConversacion = i % 10 === 0 ? 'CERRADA' : i % 8 === 0 ? 'EN_ESPERA' : 'ABIERTA';

    const convBruta = {
      id: generarUuid(i, 1),
      contactoId: generarUuid(i, 2),
      contactoNombre: nombreContacto,
      contactoTelefono: telefono,
      estado: estadoConversacion,
      ventana: {
        abierta: ventanaAbierta,
        expiraEn: expiraEnVentana,
        minutosRestantes: minutosRestantesVentana,
      },
      asignadoAId: asesor ? asesor.id : null,
      asignadoANombre: asesor ? asesor.nombre : null,
      ultimoMensajeTexto: MENSAJES_EJEMPLO[i % MENSAJES_EJEMPLO.length],
      ultimoMensajeEn: fechaMensaje,
      ultimoMensajeDireccion: direccionMensaje,
      mensajesSinLeer,
      slaVenceEn,
      etiquetas: ETIQUETAS_OPCIONES[i % ETIQUETAS_OPCIONES.length],
    };

    // Validamos en origen para garantizar que los datos mock cumplen el contrato R3 al 100%
    lista.push(ConversacionResumen.parse(convBruta));
  }

  return lista;
}

// Instancia en memoria de los 500 datos simulados
export const MOCK_CONVERSACIONES = generar500Conversaciones();

// Mapa para almacenar el detalle de mensajes y notas de las conversaciones abiertas
const MOCK_DETALLES = new Map<string, ConversacionDetalle>();

/**
 * Genera el detalle completo (mensajes y notas) para una conversación.
 */
function generarDetalleConversacion(resumen: ConversacionResumen): ConversacionDetalle {
  const ahora = Date.now();
  const idx = Number(resumen.id.split('-').pop() ?? '1');

  // Historial de mensajes
  const mensajesBrutos: Array<{
    id: string;
    conversacionId: string;
    direccion: 'ENTRANTE' | 'SALIENTE';
    tipo:
      | 'TEXTO'
      | 'IMAGEN'
      | 'DOCUMENTO'
      | 'AUDIO'
      | 'VIDEO'
      | 'UBICACION'
      | 'CONTACTO'
      | 'PLANTILLA'
      | 'INTERACTIVO'
      | 'REACCION'
      | 'NO_SOPORTADO';
    texto: string | null;
    adjuntos: Array<{
      id: string;
      tipo:
        | 'TEXTO'
        | 'IMAGEN'
        | 'DOCUMENTO'
        | 'AUDIO'
        | 'VIDEO'
        | 'UBICACION'
        | 'CONTACTO'
        | 'PLANTILLA'
        | 'INTERACTIVO'
        | 'REACCION'
        | 'NO_SOPORTADO';
      url: string;
      nombreArchivo: string | null;
      tamanoBytes: number | null;
      mimeType: string | null;
    }>;
    estado: 'PENDIENTE' | 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'REPRODUCIDO' | 'FALLIDO';
    motivoFallo: string | null;
    autorId: string | null;
    autorNombre: string | null;
    ocurridoEn: string;
  }> = [
    {
      id: generarUuid(idx * 10 + 1, 100),
      conversacionId: resumen.id,
      direccion: 'ENTRANTE' as const,
      tipo: 'TEXTO' as const,
      texto: 'Hola buenas tardes, me gustaría recibir información de paquetes turísticos.',
      adjuntos: [],
      estado: 'LEIDO' as const,
      motivoFallo: null,
      autorId: null,
      autorNombre: null,
      ocurridoEn: new Date(ahora - 120 * 60 * 1000).toISOString(),
    },
    {
      id: generarUuid(idx * 10 + 2, 100),
      conversacionId: resumen.id,
      direccion: 'SALIENTE' as const,
      tipo: 'TEXTO' as const,
      texto: `¡Hola ${resumen.contactoNombre ?? 'estimado cliente'}! Con gusto te asesoro. ¿Para cuántos viajeros y qué destino tienes en mente?`,
      adjuntos: [],
      estado: 'LEIDO' as const,
      motivoFallo: null,
      autorId: resumen.asignadoAId ?? ID_ASESOR_ACTUAL,
      autorNombre: resumen.asignadoANombre ?? NOMBRE_ASESOR_ACTUAL,
      ocurridoEn: new Date(ahora - 110 * 60 * 1000).toISOString(),
    },
    {
      id: generarUuid(idx * 10 + 3, 100),
      conversacionId: resumen.id,
      direccion: 'ENTRANTE' as const,
      tipo: 'TEXTO' as const,
      texto: resumen.ultimoMensajeTexto ?? 'Quisiera viajar en diciembre con mi familia.',
      adjuntos: [],
      estado: 'LEIDO' as const,
      motivoFallo: null,
      autorId: null,
      autorNombre: null,
      ocurridoEn: new Date(ahora - 60 * 60 * 1000).toISOString(),
    },
  ];

  // Si la conversación tiene mensaje con adjunto de imagen (1 de cada 4)
  if (idx % 4 === 0) {
    mensajesBrutos.push({
      id: generarUuid(idx * 10 + 4, 100),
      conversacionId: resumen.id,
      direccion: 'ENTRANTE' as const,
      tipo: 'IMAGEN' as const,
      texto: 'Les comparto la foto de los pasaportes para avanzar con la reserva.',
      adjuntos: [
        {
          id: generarUuid(idx * 10 + 5, 101),
          tipo: 'IMAGEN' as const,
          url: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop',
          nombreArchivo: 'pasaportes_familia.jpg',
          tamanoBytes: 1048576,
          mimeType: 'image/jpeg',
        },
      ],
      estado: 'LEIDO' as const,
      motivoFallo: null,
      autorId: null,
      autorNombre: null,
      ocurridoEn: new Date(ahora - 45 * 60 * 1000).toISOString(),
    });
  }

  // Si la conversación tiene un mensaje FALLIDO para probar el requerimiento de Meta
  if (idx % 6 === 0) {
    mensajesBrutos.push({
      id: generarUuid(idx * 10 + 6, 100),
      conversacionId: resumen.id,
      direccion: 'SALIENTE' as const,
      tipo: 'TEXTO' as const,
      texto: 'Intenté enviarle el itinerario en PDF pero falló la entrega.',
      adjuntos: [],
      estado: 'FALLIDO' as const,
      motivoFallo:
        'Fuera de la ventana de 24 horas: el número no ha iniciado conversación en el plazo permitido.',
      autorId: resumen.asignadoAId ?? ID_ASESOR_ACTUAL,
      autorNombre: resumen.asignadoANombre ?? NOMBRE_ASESOR_ACTUAL,
      ocurridoEn: new Date(ahora - 30 * 60 * 1000).toISOString(),
    });
  }

  // Notas internas
  const notasBrutas = [
    {
      id: generarUuid(idx * 10 + 7, 200),
      texto:
        'El cliente prefiere hoteles de 5 estrellas con opción Todo Incluido. Presupuesto aproximado $8.000.000 COP.',
      autorId: ID_ASESOR_ACTUAL,
      autorNombre: NOMBRE_ASESOR_ACTUAL,
      creadaEn: new Date(ahora - 90 * 60 * 1000).toISOString(),
    },
  ];

  if (idx % 3 === 0) {
    notasBrutas.push({
      id: generarUuid(idx * 10 + 8, 200),
      texto: 'Hablé con la aerolínea: hay cupos confirmados para la fecha solicitada.',
      autorId: '00000000-0000-4000-a000-000000000002',
      autorNombre: 'Laura Gómez',
      creadaEn: new Date(ahora - 15 * 60 * 1000).toISOString(),
    });
  }

  const detalleBruto = {
    ...resumen,
    mensajes: mensajesBrutos.map((m) => Mensaje.parse(m)),
    notas: notasBrutas,
  };

  return ConversacionDetalle.parse(detalleBruto);
}

/**
 * Simula la consulta paginada por cursor contra la API.
 */
export async function consultarBandejaMock(
  consulta: ConsultarBandeja,
  simularLatenciaMs = 250,
): Promise<PaginaBandeja> {
  if (simularLatenciaMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simularLatenciaMs));
  }

  let filtradas = [...MOCK_CONVERSACIONES];
  const ahora = Date.now();

  // 1. Filtro principal
  if (consulta.filtro === 'MIAS') {
    filtradas = filtradas.filter((c) => c.asignadoAId === ID_ASESOR_ACTUAL);
  } else if (consulta.filtro === 'SIN_ASIGNAR') {
    filtradas = filtradas.filter((c) => c.asignadoAId === null);
  } else if (consulta.filtro === 'SIN_LEER') {
    filtradas = filtradas.filter((c) => c.mensajesSinLeer > 0);
  } else if (consulta.filtro === 'SLA_VENCIDO') {
    filtradas = filtradas.filter(
      (c) => c.slaVenceEn !== null && new Date(c.slaVenceEn).getTime() < ahora,
    );
  }

  // 2. Filtro de estado si aplica
  if (consulta.estado) {
    filtradas = filtradas.filter((c) => c.estado === consulta.estado);
  }

  // 3. Búsqueda por texto (nombre, teléfono, texto del mensaje)
  if (consulta.buscar && consulta.buscar.trim().length > 0) {
    const q = consulta.buscar.trim().toLowerCase();
    filtradas = filtradas.filter((c) => {
      const nom = c.contactoNombre?.toLowerCase() ?? '';
      const tel = c.contactoTelefono.toLowerCase();
      const txt = c.ultimoMensajeTexto?.toLowerCase() ?? '';
      return nom.includes(q) || tel.includes(q) || txt.includes(q);
    });
  }

  // 4. Paginación por cursor
  const limite = consulta.limite ?? 30;
  let offset = 0;

  if (consulta.cursor) {
    const idx = filtradas.findIndex((c) => c.id === consulta.cursor);
    if (idx !== -1) {
      offset = idx + 1;
    }
  }

  const datosPagina = filtradas.slice(offset, offset + limite);
  const hasMore = offset + limite < filtradas.length;
  const ultimo = datosPagina[datosPagina.length - 1];
  const nextCursor = hasMore && ultimo ? ultimo.id : null;

  return {
    datos: datosPagina,
    pageInfo: {
      nextCursor,
      hasMore,
    },
  };
}

/**
 * Obtiene una conversación abierta con su historial completo.
 */
export async function obtenerConversacionDetalleMock(
  id: string,
  simularLatenciaMs = 150,
): Promise<ConversacionDetalle | null> {
  if (simularLatenciaMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simularLatenciaMs));
  }

  const resumen = MOCK_CONVERSACIONES.find((c) => c.id === id);
  if (!resumen) return null;

  let detalle = MOCK_DETALLES.get(id);
  if (!detalle) {
    detalle = generarDetalleConversacion(resumen);
    MOCK_DETALLES.set(id, detalle);
  }

  return detalle;
}

/**
 * Simula el envío de un mensaje de texto con clave de idempotencia.
 */
export async function enviarTextoMock(entrada: EnviarTexto): Promise<Mensaje> {
  const detalle = await obtenerConversacionDetalleMock(entrada.conversacionId, 100);
  if (!detalle) {
    throw new Error('Conversación no encontrada');
  }

  if (!detalle.ventana.abierta) {
    throw new Error(
      'VENTANA_CERRADA: No se puede enviar texto libre fuera de la ventana de 24 horas',
    );
  }

  const ahora = new Date().toISOString();
  const nuevoMensaje = Mensaje.parse({
    id: crypto.randomUUID(),
    conversacionId: entrada.conversacionId,
    direccion: 'SALIENTE',
    tipo: 'TEXTO',
    texto: entrada.texto,
    adjuntos: [],
    estado: 'ENTREGADO',
    motivoFallo: null,
    autorId: ID_ASESOR_ACTUAL,
    autorNombre: NOMBRE_ASESOR_ACTUAL,
    ocurridoEn: ahora,
  });

  detalle.mensajes.push(nuevoMensaje);
  detalle.ultimoMensajeTexto = entrada.texto;
  detalle.ultimoMensajeEn = ahora;
  detalle.ultimoMensajeDireccion = 'SALIENTE';

  // Actualizar también la lista resumen
  const resumen = MOCK_CONVERSACIONES.find((c) => c.id === entrada.conversacionId);
  if (resumen) {
    resumen.ultimoMensajeTexto = entrada.texto;
    resumen.ultimoMensajeEn = ahora;
    resumen.ultimoMensajeDireccion = 'SALIENTE';
  }

  return nuevoMensaje;
}

/**
 * Simula la creación de una nota interna para el equipo.
 */
export async function crearNotaMock(entrada: CrearNota) {
  const detalle = await obtenerConversacionDetalleMock(entrada.conversacionId, 100);
  if (!detalle) {
    throw new Error('Conversación no encontrada');
  }

  const nuevaNota = {
    id: crypto.randomUUID(),
    texto: entrada.texto,
    autorId: ID_ASESOR_ACTUAL,
    autorNombre: NOMBRE_ASESOR_ACTUAL,
    creadaEn: new Date().toISOString(),
  };

  detalle.notas.push(nuevaNota);
  return nuevaNota;
}

/**
 * Simula la asignación de un asesor a la conversación.
 */
export async function asignarConversacionMock(entrada: AsignarConversacion) {
  await Promise.resolve();
  const resumen = MOCK_CONVERSACIONES.find((c) => c.id === entrada.conversacionId);
  if (!resumen) throw new Error('Conversación no encontrada');

  const asesor = ASESORES.find((a) => a.id === entrada.usuarioId);
  resumen.asignadoAId = asesor ? asesor.id : null;
  resumen.asignadoANombre = asesor ? asesor.nombre : null;

  const detalle = MOCK_DETALLES.get(entrada.conversacionId);
  if (detalle) {
    detalle.asignadoAId = resumen.asignadoAId;
    detalle.asignadoANombre = resumen.asignadoANombre;
  }

  return resumen;
}

/**
 * Simula el cambio de estado de la conversación (ABIERTA, EN_ESPERA, CERRADA).
 */
export async function cambiarEstadoConversacionMock(entrada: CambiarEstadoConversacion) {
  await Promise.resolve();
  const resumen = MOCK_CONVERSACIONES.find((c) => c.id === entrada.conversacionId);
  if (!resumen) throw new Error('Conversación no encontrada');

  resumen.estado = entrada.estado;

  const detalle = MOCK_DETALLES.get(entrada.conversacionId);
  if (detalle) {
    detalle.estado = entrada.estado;
  }

  return resumen;
}
