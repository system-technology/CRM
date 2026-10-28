/**
 * Datos simulados de la bandeja de conversaciones.
 *
 * **Archivo temporal para la rebanada vertical de frontend.**
 * Contiene 500+ conversaciones generadas con variedad realista (SLA vencido, ventana 24h cerrada,
 * sin asignar, sin leer, nombres nulos, textos de 4000 caracteres, filas ultra-pobres)
 * para verificar el comportamiento ante casos límite antes de contar con la API real.
 */

import {
  ConversacionDetalle,
  ConversacionResumen,
  Mensaje,
  type AsignarConversacion,
  type CambiarEstadoConversacion,
  type ConsultarBandeja,
  type CrearNota,
  type EnviarCotizacionCuerpo,
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

function generarUuid(index: number, grupo: number = 1): string {
  const hexIdx = index.toString(16).padStart(12, '0');
  const hexGrp = grupo.toString(16).padStart(4, '0');
  return `00000000-${hexGrp}-4000-8000-${hexIdx}`;
}

function generar500Conversaciones(): ConversacionResumen[] {
  const ahora = Date.now();
  const lista: ConversacionResumen[] = [];

  // CASOS LÍMITE DE PRUEBA EXPLICITA (TAREA 4)

  // 1. Fila ultra-pobre: sin nombre, sin etiquetas, sin último mensaje
  lista.push(
    ConversacionResumen.parse({
      id: '00000000-0001-4000-8000-000000000991',
      contactoId: '00000000-0002-4000-8000-000000000991',
      contactoNombre: null,
      contactoTelefono: '+573000009999',
      estado: 'ABIERTA',
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: null,
      ultimoMensajeEn: null,
      ultimoMensajeDireccion: null,
      mensajesSinLeer: 0,
      slaVenceEn: null,
      etiquetas: [],
    }),
  );

  // 2. Texto de último mensaje de 4.000 caracteres sin espacios
  lista.push(
    ConversacionResumen.parse({
      id: '00000000-0001-4000-8000-000000000992',
      contactoId: '00000000-0002-4000-8000-000000000992',
      contactoNombre: 'Cliente Texto Extremo 4000',
      contactoTelefono: '+573111119999',
      estado: 'ABIERTA',
      ventana: {
        abierta: true,
        expiraEn: new Date(ahora + 12 * 3600000).toISOString(),
        minutosRestantes: 720,
      },
      asignadoAId: ID_ASESOR_ACTUAL,
      asignadoANombre: NOMBRE_ASESOR_ACTUAL,
      ultimoMensajeTexto: 'A'.repeat(200), // Recortado a 200 en resumen por contrato
      ultimoMensajeEn: new Date(ahora - 5 * 60000).toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 1,
      slaVenceEn: new Date(ahora + 2 * 3600000).toISOString(),
      etiquetas: ['PruebaExtrema'],
    }),
  );

  // 3. Nombre de contacto extremadamente largo en 390px
  lista.push(
    ConversacionResumen.parse({
      id: '00000000-0001-4000-8000-000000000993',
      contactoId: '00000000-0002-4000-8000-000000000993',
      contactoNombre:
        'María Alejandrina de la Santísima Trinidad Rodríguez y Mendoza de Valenzuela',
      contactoTelefono: '+573222229999',
      estado: 'ABIERTA',
      ventana: {
        abierta: true,
        expiraEn: new Date(ahora + 8 * 3600000).toISOString(),
        minutosRestantes: 480,
      },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: 'Consulta de cotización para grupo familiar numeroso.',
      ultimoMensajeEn: new Date(ahora - 2 * 60000).toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 2,
      slaVenceEn: new Date(ahora + 30 * 60000).toISOString(),
      etiquetas: ['VIP', 'NombreLargo'],
    }),
  );

  // Generación de 500 conversaciones adicionales
  for (let i = 1; i <= 500; i++) {
    const minHace = i * 4;
    const timestampMsg = new Date(ahora - minHace * 60 * 1000).toISOString();

    const sinNombre = i % 7 === 0;
    const contactoNombre = sinNombre
      ? null
      : NOMBRES_CONTACTOS[(i - 1) % NOMBRES_CONTACTOS.length] + (i > 20 ? ` (${i})` : '');
    const contactoTelefono = `+57300${(i * 12345).toString().padStart(7, '0').slice(0, 7)}`;

    const asignado = i % 3 === 0 ? null : ASESORES[(i - 1) % ASESORES.length];
    const sinLeer = i % 5 === 0 ? (i % 3) + 1 : 0;
    const direccion = i % 2 === 0 ? ('ENTRANTE' as const) : ('SALIENTE' as const);

    const slaVencido = i % 9 === 0;
    const slaVenceEn = slaVencido
      ? new Date(ahora - (i * 2 + 10) * 60 * 1000).toISOString()
      : i % 4 === 0
        ? new Date(ahora + (i * 3 + 15) * 60 * 1000).toISOString()
        : null;

    const ventanaCerrada = i % 8 === 0;
    // Variar los tiempos restantes para demostrar casos urgentes (<60m), medios y holgados
    let minutosRestantes: number;
    if (ventanaCerrada) {
      minutosRestantes = -60;
    } else if (i % 7 === 1) {
      minutosRestantes = 35; // Urgente: 35 min restantes (< 1h)
    } else if (i % 7 === 2) {
      minutosRestantes = 95; // 1 h 35 min
    } else if (i % 7 === 3) {
      minutosRestantes = 240; // 4 horas
    } else if (i % 7 === 4) {
      minutosRestantes = 510; // 8 h 30 min
    } else {
      minutosRestantes = 1080; // 18 horas
    }

    const expiraEn = ventanaCerrada
      ? new Date(ahora - 3600000).toISOString()
      : new Date(ahora + minutosRestantes * 60000).toISOString();

    const ventanaServicio = {
      abierta: !ventanaCerrada,
      expiraEn,
      minutosRestantes,
    };

    const textoMsg =
      MENSAJES_EJEMPLO[(i - 1) % MENSAJES_EJEMPLO.length] || 'Consulta sobre paquete turístico';
    const etiquetas = ETIQUETAS_OPCIONES[i % ETIQUETAS_OPCIONES.length] || [];

    const resumen = {
      id: generarUuid(i, 1),
      contactoId: generarUuid(i, 2),
      contactoNombre,
      contactoTelefono,
      estado: 'ABIERTA' as const,
      ventana: ventanaServicio,
      asignadoAId: asignado ? asignado.id : null,
      asignadoANombre: asignado ? asignado.nombre : null,
      ultimoMensajeTexto: textoMsg,
      ultimoMensajeEn: timestampMsg,
      ultimoMensajeDireccion: direccion,
      mensajesSinLeer: sinLeer,
      slaVenceEn,
      etiquetas,
    };

    lista.push(ConversacionResumen.parse(resumen));
  }

  return lista;
}

export const MOCK_CONVERSACIONES: ConversacionResumen[] = generar500Conversaciones();

const MOCK_DETALLES = new Map<string, ConversacionDetalle>();

function generarDetalleConversacion(resumen: ConversacionResumen): ConversacionDetalle {
  const ahora = Date.now();
  const mensajesBrutos = [];

  // Si es el caso 502 de 4000 caracteres
  if (resumen.id === '00000000-0001-4000-8000-000000000992') {
    mensajesBrutos.push({
      id: 'msg-4000-char',
      conversacionId: resumen.id,
      direccion: 'ENTRANTE' as const,
      tipo: 'TEXTO' as const,
      texto: 'A'.repeat(4000),
      adjuntos: [],
      estado: 'ENTREGADO' as const,
      motivoFallo: null,
      autorId: null,
      autorNombre: null,
      ocurridoEn: new Date(ahora - 5 * 60000).toISOString(),
    });
  } else if (resumen.ultimoMensajeEn && resumen.ultimoMensajeTexto) {
    mensajesBrutos.push({
      id: generarUuid(1, 10),
      conversacionId: resumen.id,
      direccion: 'ENTRANTE' as const,
      tipo: 'TEXTO' as const,
      texto: 'Hola, buenas tardes.',
      adjuntos: [],
      estado: 'ENTREGADO' as const,
      motivoFallo: null,
      autorId: null,
      autorNombre: null,
      ocurridoEn: new Date(ahora - 120 * 60 * 1000).toISOString(),
    });

    mensajesBrutos.push({
      id: generarUuid(2, 10),
      conversacionId: resumen.id,
      direccion: resumen.ultimoMensajeDireccion || 'SALIENTE',
      tipo: 'TEXTO' as const,
      texto: resumen.ultimoMensajeTexto,
      adjuntos: [],
      estado: 'ENTREGADO' as const,
      motivoFallo: null,
      autorId: resumen.asignadoAId ?? ID_ASESOR_ACTUAL,
      autorNombre: resumen.asignadoANombre ?? NOMBRE_ASESOR_ACTUAL,
      ocurridoEn: resumen.ultimoMensajeEn,
    });
  }

  const detalleBruto = {
    ...resumen,
    mensajes: mensajesBrutos.map((m) => Mensaje.parse(m)),
    notas: [
      {
        id: generarUuid(1, 200),
        texto: 'Nota de seguimiento para el cliente.',
        autorId: ID_ASESOR_ACTUAL,
        autorNombre: NOMBRE_ASESOR_ACTUAL,
        creadaEn: new Date(ahora - 90 * 60 * 1000).toISOString(),
      },
    ],
  };

  return ConversacionDetalle.parse(detalleBruto);
}

export async function consultarBandejaMock(
  consulta: ConsultarBandeja,
  simularLatenciaMs = 250,
): Promise<PaginaBandeja> {
  if (simularLatenciaMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simularLatenciaMs));
  }

  let filtradas = [...MOCK_CONVERSACIONES];
  const ahora = Date.now();

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

  if (consulta.estado) {
    filtradas = filtradas.filter((c) => c.estado === consulta.estado);
  }

  if (consulta.buscar && consulta.buscar.trim().length > 0) {
    const q = consulta.buscar.trim().toLowerCase();
    filtradas = filtradas.filter((c) => {
      const nom = c.contactoNombre?.toLowerCase() ?? '';
      const tel = c.contactoTelefono.toLowerCase();
      const txt = c.ultimoMensajeTexto?.toLowerCase() ?? '';
      return nom.includes(q) || tel.includes(q) || txt.includes(q);
    });
  }

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

  const resumen = MOCK_CONVERSACIONES.find((c) => c.id === entrada.conversacionId);
  if (resumen) {
    resumen.ultimoMensajeTexto = entrada.texto;
    resumen.ultimoMensajeEn = ahora;
    resumen.ultimoMensajeDireccion = 'SALIENTE';
  }

  return nuevoMensaje;
}

export async function enviarCotizacionMock(
  conversacionId: string,
  cuerpo: EnviarCotizacionCuerpo,
): Promise<Mensaje> {
  const detalle = await obtenerConversacionDetalleMock(conversacionId, 100);
  if (!detalle) {
    throw new Error('Conversación no encontrada');
  }

  if (!detalle.ventana.abierta) {
    throw new Error(
      'VENTANA_CERRADA: No se puede enviar cotizaciones fuera de la ventana de 24 horas',
    );
  }

  const ahora = new Date().toISOString();
  const versionNum = cuerpo.version ?? 1;
  const texto = `✈️ *Propuesta de Viaje Personalizada (v${versionNum})*\n\nTe compartimos los detalles de la cotización preparada especialmente para ti. Para revisar itinerario, condiciones y opciones de pago, ingresa aquí.\n\n_ViajaPro CRM_`;

  const nuevoMensaje = Mensaje.parse({
    id: crypto.randomUUID(),
    conversacionId,
    direccion: 'SALIENTE',
    tipo: 'TEXTO',
    texto,
    adjuntos: [],
    estado: 'ENTREGADO',
    motivoFallo: null,
    autorId: ID_ASESOR_ACTUAL,
    autorNombre: NOMBRE_ASESOR_ACTUAL,
    ocurridoEn: ahora,
    cotizacionId: cuerpo.cotizacionId,
  });

  detalle.mensajes.push(nuevoMensaje);
  detalle.ultimoMensajeTexto = texto;
  detalle.ultimoMensajeEn = ahora;
  detalle.ultimoMensajeDireccion = 'SALIENTE';

  const resumen = MOCK_CONVERSACIONES.find((c) => c.id === conversacionId);
  if (resumen) {
    resumen.ultimoMensajeTexto = texto;
    resumen.ultimoMensajeEn = ahora;
    resumen.ultimoMensajeDireccion = 'SALIENTE';
  }

  return nuevoMensaje;
}

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
