/**
 * Lógica pura del Copilot Asistente IA para la Bandeja de WhatsApp.
 *
 * Cumple:
 * - Regla R8: Dinero en enteros de COP sin flotantes.
 * - Regla R10: No expone PII sensible.
 * - Regla UX: "human_approval_required_for_ai_outbound" (salidas de IA requieren aprobación explícita).
 * - Cero dependencias de UI, 100% testeable en Vitest.
 */

export interface DatosViajeExtraidos {
  destino: string | null;
  adultos: number;
  ninos: number;
  fechasTentativas: string | null;
  presupuestoEstimadoCop: number | null;
  interesEspecifico: string | null;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface CalificacionLead {
  puntuacion: number; // 0 a 100
  nivel: 'ALTO' | 'MEDIO' | 'BAJO';
  justificacion: string;
}

export interface ResumenChatIa {
  puntosClave: string[];
  intencionPrincipal: string;
  proximaAccionSugerida: string;
}

const DESTINOS_CONOCIDOS = [
  'Cancún',
  'San Andrés',
  'Punta Cana',
  'Cartagena',
  'Santa Marta',
  'Eje Cafetero',
  'Orlando',
  'Curazao',
  'Aruba',
  'Madrid',
  'Europa',
  'Medellín',
];

/**
 * Analiza el historial de mensajes para extraer variables clave del viaje.
 */
export function extraerDatosViajeDeMensajes(textos: string[]): DatosViajeExtraidos {
  const textoUnificado = textos.join(' ').toLowerCase();

  // 1. Detección de Destino
  let destinoDetectado: string | null = null;
  for (const dest of DESTINOS_CONOCIDOS) {
    if (textoUnificado.includes(dest.toLowerCase())) {
      destinoDetectado = dest;
      break;
    }
  }

  // 2. Detección de Pasajeros (Adultos y Niños)
  let adultos = 2; // Valor predeterminado estándar
  let ninos = 0;

  const matchAdultos = textoUnificado.match(/(\d+)\s*(adulto|persona|pax|viajero)/i);
  if (matchAdultos?.[1]) {
    adultos = Math.max(1, parseInt(matchAdultos[1], 10));
  } else if (
    textoUnificado.includes('mi pareja y yo') ||
    textoUnificado.includes('mi esposo y yo') ||
    textoUnificado.includes('mi esposa y yo')
  ) {
    adultos = 2;
  } else if (textoUnificado.includes('viajo solo') || textoUnificado.includes('para mi solo')) {
    adultos = 1;
  }

  const matchNinos = textoUnificado.match(/(\d+)\s*(niño|hijo|menor)/i);
  if (matchNinos?.[1]) {
    ninos = Math.max(0, parseInt(matchNinos[1], 10));
  }

  // 3. Detección de Fechas
  let fechasTentativas: string | null = null;
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
    'semana santa',
    'vacaciones de mitad de año',
    'receso',
  ];
  for (const m of meses) {
    if (textoUnificado.includes(m)) {
      fechasTentativas = m.charAt(0).toUpperCase() + m.slice(1);
      break;
    }
  }

  // 4. Detección de Presupuesto en COP (R8)
  let presupuestoCop: number | null = null;
  const matchMillones = textoUnificado.match(/(\d+)\s*(millon|millones|m)/i);
  if (matchMillones?.[1]) {
    presupuestoCop = parseInt(matchMillones[1], 10) * 1_000_000;
  } else {
    const matchCifras = textoUnificado.match(/\$?\s*(\d{1,3}(?:\.\d{3}){1,2})/);
    if (matchCifras?.[1]) {
      const limpia = matchCifras[1].replace(/\./g, '');
      const parsed = parseInt(limpia, 10);
      if (parsed > 100_000) {
        presupuestoCop = parsed;
      }
    }
  }

  // 5. Interés específico
  let interes: string | null = null;
  if (textoUnificado.includes('todo incluido') || textoUnificado.includes('all inclusive')) {
    interes = 'Plan Todo Incluido';
  } else if (textoUnificado.includes('playa') || textoUnificado.includes('mar')) {
    interes = 'Hotel frente al mar';
  } else if (textoUnificado.includes('vuelo') && textoUnificado.includes('hotel')) {
    interes = 'Vuelos + Hotel';
  }

  // 6. Nivel de Confianza
  let confianza: 'ALTA' | 'MEDIA' | 'BAJA' = 'BAJA';
  let camposDetectados = 0;
  if (destinoDetectado) camposDetectados++;
  if (fechasTentativas) camposDetectados++;
  if (presupuestoCop) camposDetectados++;
  if (matchAdultos || matchNinos) camposDetectados++;

  if (camposDetectados >= 3) {
    confianza = 'ALTA';
  } else if (camposDetectados >= 1) {
    confianza = 'MEDIA';
  }

  return {
    destino: destinoDetectado,
    adultos,
    ninos,
    fechasTentativas,
    presupuestoEstimadoCop: presupuestoCop,
    interesEspecifico: interes,
    confianza,
  };
}

/**
 * Genera un resumen ejecutivo de la conversación en 3 viñetas.
 */
export function generarResumenConversacion(
  textos: string[],
  _contactoNombre: string,
): ResumenChatIa {
  const datos = extraerDatosViajeDeMensajes(textos);
  const puntos: string[] = [];

  if (datos.destino) {
    puntos.push(
      `Interés confirmado en viajar a ${datos.destino} para ${datos.adultos} adulto(s)${
        datos.ninos > 0 ? ` y ${datos.ninos} niño(s)` : ''
      }.`,
    );
  } else {
    puntos.push('Consulta turística inicial; destino específico aún por definir.');
  }

  if (datos.fechasTentativas) {
    puntos.push(`Fecha proyectada: ${datos.fechasTentativas}.`);
  } else {
    puntos.push('Fechas flexibles o pendientes de confirmación con el viajero.');
  }

  if (datos.presupuestoEstimadoCop) {
    puntos.push(
      `Presupuesto manifestado: $${datos.presupuestoEstimadoCop.toLocaleString('es-CO')} COP.`,
    );
  } else if (datos.interesEspecifico) {
    puntos.push(`Preferencia destacada: ${datos.interesEspecifico}.`);
  } else {
    puntos.push('Sin restricción explícita de presupuesto informada.');
  }

  const intencion = datos.destino
    ? `Cotizar paquete a ${datos.destino}`
    : 'Información general de viajes';

  const proximaAccion = datos.destino
    ? 'Preparar cotización en Cotizador y enviar propuesta en PDF'
    : 'Preguntar fechas tentativas y preferencias de destino';

  return {
    puntosClave: puntos,
    intencionPrincipal: intencion,
    proximaAccionSugerida: proximaAccion,
  };
}

/**
 * Genera una sugerencia de respuesta comercial amigable y profesional.
 * Nota crítica: Se inserta en el editor para REVISIÓN HUMANA obligatoria.
 */
export function sugerirRespuestaComercial(
  datos: DatosViajeExtraidos,
  contactoNombre: string,
  _ultimoMensajeCliente?: string,
): string {
  const nombrePila = contactoNombre.split(' ')[0] || 'Hola';

  if (!datos.destino) {
    return (
      `¡Hola, ${nombrePila}! 👋 Con muchísimo gusto te asesoramos con tu próximo viaje. ` +
      `¿Tienes algún destino en mente (playa nacional, Caribe o internacional) o fechas aproximadas para viajar? ` +
      `Así te comparto las mejores opciones vigentes de nuestros mayoristas.`
    );
  }

  const paxTexto =
    datos.ninos > 0
      ? `para ${datos.adultos} adultos y ${datos.ninos} niños`
      : `para ${datos.adultos} personas`;

  const fechasTexto = datos.fechasTentativas ? ` en ${datos.fechasTentativas}` : '';

  return (
    `¡Hola, ${nombrePila}! 🌴 Con gusto te ayudo con tu plan a ${datos.destino} ${paxTexto}${fechasTexto}. ` +
    `Tenemos excelentes paquetes con vuelos, traslados y hotel todo incluido. ` +
    `¿Te gustaría que te prepare una cotización detallada con las mejores opciones de tarifa y facilidades de pago?`
  );
}

/**
 * Calcula una calificación objetiva del lead comercial (0 a 100).
 */
export function calificarLead(datos: DatosViajeExtraidos): CalificacionLead {
  let score = 30; // Base por consulta activa
  const motivos: string[] = [];

  if (datos.destino) {
    score += 30;
    motivos.push('Destino definido');
  }

  if (datos.fechasTentativas) {
    score += 20;
    motivos.push('Temporada/fechas claras');
  }

  if (datos.presupuestoEstimadoCop && datos.presupuestoEstimadoCop > 2_000_000) {
    score += 20;
    motivos.push('Presupuesto declarado');
  }

  let nivel: 'ALTO' | 'MEDIO' | 'BAJO' = 'BAJO';
  if (score >= 70) {
    nivel = 'ALTO';
  } else if (score >= 50) {
    nivel = 'MEDIO';
  }

  return {
    puntuacion: Math.min(100, score),
    nivel,
    justificacion: motivos.length > 0 ? motivos.join(', ') : 'Consulta incipiente sin parámetros',
  };
}
