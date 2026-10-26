import { describe, expect, it } from 'vitest';
import { EventoBandeja, type ConversacionResumen } from '@viajapro/contracts';
import { realtimeMockBus } from './realtime-mock';
import {
  reordenarConGuardia,
  claveDeReintento,
  debeBajarElScroll,
  calcularTiempoRestanteVentana,
  evaluarTransicionVentanaBorrador,
  calcularPermisosAsignacion,
  evaluarConversacionRetirada,
} from './bandeja-logica';
import { obtenerMockFichaDeContacto } from './mock-crm';

describe('Pruebas Automáticas de la Bandeja — Reglas de Comportamiento (0b & Tarea 5)', () => {
  // 1. Un MENSAJE_NUEVO llega al suscriptor
  it('1. Un MENSAJE_NUEVO llega al suscriptor sin ser descartado en silencio (UUID v4 válido)', () => {
    let eventoRecibido: EventoBandeja | null = null;

    const unsubscribe = realtimeMockBus.subscribe((evento: EventoBandeja) => {
      eventoRecibido = evento;
    });

    const convId = '00000000-0000-4000-8000-000000000001';
    const mensaje = realtimeMockBus.emitirMensajeNuevo(
      convId,
      'Hola, confirmación de vuelo recibida',
      'ENTRANTE',
    );

    unsubscribe();

    // Validar UUID v4 estricto
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(mensaje.id).toMatch(uuidRegex);

    // Validar recepción por el suscriptor
    expect(eventoRecibido).not.toBeNull();
    const ev = eventoRecibido as unknown as EventoBandeja;
    expect(ev.tipo).toBe('MENSAJE_NUEVO');
  });

  // 2. Dos eventos con el ratón encima: ambos sobreviven en el búfer
  it('2. reordenarConGuardia acumula eventos en el búfer cuando el ratón está encima y no mueve la lista visible', () => {
    const conv1: ConversacionResumen = {
      id: '00000000-0000-4000-8000-000000000201',
      estado: 'ABIERTA',
      contactoId: 'cnt-201',
      contactoNombre: 'Cliente A',
      contactoTelefono: '+573000000201',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Inicio A',
      ultimoMensajeEn: new Date(Date.now() - 50000).toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const conv2: ConversacionResumen = {
      id: '00000000-0000-4000-8000-000000000202',
      estado: 'ABIERTA',
      contactoId: 'cnt-202',
      contactoNombre: 'Cliente B',
      contactoTelefono: '+573000000202',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Inicio B',
      ultimoMensajeEn: new Date(Date.now() - 60000).toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const listaInicial = [conv1, conv2];
    const ratonEncima = true;

    // Evento 1
    const evento1: EventoBandeja = {
      tipo: 'MENSAJE_NUEVO',
      conversacionId: conv1.id,
      mensaje: {
        id: '00000000-0000-4000-8000-000000000011',
        conversacionId: conv1.id,
        direccion: 'ENTRANTE',
        tipo: 'TEXTO',
        texto: 'Actualización A',
        adjuntos: [],
        estado: 'ENTREGADO',
        motivoFallo: null,
        autorId: null,
        autorNombre: null,
        ocurridoEn: new Date().toISOString(),
        cotizacionId: null,
      },
    };

    const paso1 = reordenarConGuardia(listaInicial, null, evento1, ratonEncima);
    expect(paso1.nuevoPendiente).toBe(true);
    expect(paso1.listaVisible).toBe(listaInicial); // No se mueve bajo el cursor
    expect(paso1.nuevoBuffer).not.toBeNull();
    expect(paso1.nuevoBuffer?.find((c) => c.id === conv1.id)?.ultimoMensajeTexto).toBe(
      'Actualización A',
    );

    // Evento 2: debe acumular sobre el buffer anterior (no sobre listaInicial)
    const evento2: EventoBandeja = {
      tipo: 'MENSAJE_NUEVO',
      conversacionId: conv2.id,
      mensaje: {
        id: '00000000-0000-4000-8000-000000000022',
        conversacionId: conv2.id,
        direccion: 'ENTRANTE',
        tipo: 'TEXTO',
        texto: 'Actualización B',
        adjuntos: [],
        estado: 'ENTREGADO',
        motivoFallo: null,
        autorId: null,
        autorNombre: null,
        ocurridoEn: new Date().toISOString(),
        cotizacionId: null,
      },
    };

    const paso2 = reordenarConGuardia(listaInicial, paso1.nuevoBuffer, evento2, ratonEncima);
    expect(paso2.nuevoPendiente).toBe(true);
    expect(paso2.listaVisible).toBe(listaInicial);

    // AFIRMAR QUE AMBOS SOBREVIVIERON EN EL BUFFER FINAL
    const bufferFinal = paso2.nuevoBuffer;
    expect(bufferFinal).not.toBeNull();
    expect(bufferFinal?.find((c) => c.id === conv1.id)?.ultimoMensajeTexto).toBe('Actualización A');
    expect(bufferFinal?.find((c) => c.id === conv2.id)?.ultimoMensajeTexto).toBe('Actualización B');
  });

  // 3. Reintentar un envío fallido reutiliza la clave de idempotencia (R5)
  it('3. claveDeReintento reutiliza estrictamente la misma clave para el mismo mensajeId (R5)', () => {
    const mapaIdempotencia: Record<string, string> = {};
    const mensajeId = '00000000-0000-4000-8000-000000000123';

    // 1. Primer intento: genera clave nueva
    const intento1 = claveDeReintento(mapaIdempotencia, mensajeId);
    expect(intento1.esReutilizada).toBe(false);
    expect(intento1.clave).toBeDefined();

    // 2. Reintento: debe reutilizar exactamente la misma clave generada
    const intento2 = claveDeReintento(mapaIdempotencia, mensajeId);
    expect(intento2.esReutilizada).toBe(true);
    expect(intento2.clave).toBe(intento1.clave);
  });

  // 4. Un EventoBandeja de tipo desconocido se ignora sin romper nada
  it('4. Un EventoBandeja de tipo desconocido se ignora en silencio sin lanzar error (safeParse)', () => {
    let llamado = false;
    const unsubscribe = realtimeMockBus.subscribe(() => {
      llamado = true;
    });

    const resultado = realtimeMockBus.emitirEventoDesconocido();

    unsubscribe();

    // safeParse debe retornar false y el listener no debe ser notificado
    expect(resultado).toBe(false);
    expect(llamado).toBe(false);
  });

  // 5. debeBajarElScroll calcula la distancia al fondo sin robar posición
  it('5. debeBajarElScroll devuelve false si el asesor está leyendo arriba y true solo cerca del fondo', () => {
    const umbral = 80;

    // Distancia grande (scrolleado hacia arriba leyendo historial antiguo)
    expect(debeBajarElScroll(500, umbral)).toBe(false);
    expect(debeBajarElScroll(150, umbral)).toBe(false);

    // Cerca del fondo (menos o igual al umbral)
    expect(debeBajarElScroll(80, umbral)).toBe(true);
    expect(debeBajarElScroll(10, umbral)).toBe(true);
    expect(debeBajarElScroll(0, umbral)).toBe(true);
  });

  // 6. calcularTiempoRestanteVentana restringe correctamente la ventana cerrada
  it('6. calcularTiempoRestanteVentana detecta cuando la ventana de 24h está cerrada o calcula horas restantes', () => {
    // Caso 1: Ventana expirada (fecha en el pasado)
    const fechaPasada = new Date(Date.now() - 3600 * 1000).toISOString();
    const estadoExpirado = calcularTiempoRestanteVentana(fechaPasada);
    expect(estadoExpirado.cerrada).toBe(true);
    expect(estadoExpirado.minutos).toBe(0);
    expect(estadoExpirado.texto).toBe('Ventana cerrada');

    // Caso 2: Ventana abierta con 2 horas y 30 minutos restantes
    const fechaFutura = new Date(Date.now() + 150 * 60 * 1000).toISOString();
    const estadoAbierto = calcularTiempoRestanteVentana(fechaFutura);
    expect(estadoAbierto.cerrada).toBe(false);
    expect(estadoAbierto.horas).toBe(2);
    expect(estadoAbierto.minutos).toBeGreaterThanOrEqual(149);
    expect(estadoAbierto.texto).toContain('2 h');
  });
  // 7. La Ficha del Viajero está atada a su conversación (0d): dos conversaciones distintas devuelven teléfonos distintos
  it('7. La Ficha del Viajero está atada a su conversación (0d): dos conversaciones distintas devuelven teléfonos distintos', () => {
    // Abrir dos conversaciones distintas (Juan Pérez vs Ana Martínez)
    const convJuanId = '00000000-0001-4000-8000-000000000001';
    const convAnaId = '00000000-0001-4000-8000-000000000002';

    const fichaJuan = obtenerMockFichaDeContacto(convJuanId);
    const fichaAna = obtenerMockFichaDeContacto(convAnaId);

    // Criterio de aceptación explícito de Claude:
    // "una prueba que abra dos conversaciones distintas y afirme que el teléfono de la ficha es distinto"
    expect(fichaJuan.contacto.telefono).not.toBe(fichaAna.contacto.telefono);
  });
  // 8. Transición de ventana con borrador (0c.19): si se cierra con borrador escrito, se preserva y se avisa
  it('8. evaluarTransicionVentanaBorrador avisa si la ventana se cierra con texto no vacío y preserva el borrador', () => {
    // Caso 1: Ventana se cierra (abierta -> cerrada) con borrador redactado
    const r1 = evaluarTransicionVentanaBorrador(
      true,
      false,
      'Hola, tenemos los vuelos a Cartagena listos',
    );
    expect(r1.debeMostrar).toBe(true);
    expect(r1.mensaje).toBe('La ventana se cerró; tu borrador sigue aquí');
    expect(r1.borrador).toBe('Hola, tenemos los vuelos a Cartagena listos');

    // Caso 2: Ventana se cierra (abierta -> cerrada) pero sin borrador (espacios en blanco)
    const r2 = evaluarTransicionVentanaBorrador(true, false, '   ');
    expect(r2.debeMostrar).toBe(false);
    expect(r2.borrador).toBe('');

    // Caso 3: Ventana sigue abierta con texto
    const r3 = evaluarTransicionVentanaBorrador(true, true, 'Texto redactando...');
    expect(r3.debeMostrar).toBe(false);

    // Caso 4: Ventana ya estaba cerrada (sin transición de cierre)
    const r4 = evaluarTransicionVentanaBorrador(false, false, 'Borrador existente');
    expect(r4.debeMostrar).toBe(false);
  });
  // 9. CONVERSACION_RETIRADA en reordenarConGuardia (0c.35): retira de la lista
  it('9. reordenarConGuardia retira la conversación si recibe CONVERSACION_RETIRADA', () => {
    const conv1: ConversacionResumen = {
      id: '00000000-0000-4000-8000-000000000301',
      estado: 'ABIERTA',
      contactoId: 'cnt-301',
      contactoNombre: 'Cliente Retirado',
      contactoTelefono: '+573000000301',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Mensaje 1',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const conv2: ConversacionResumen = {
      id: '00000000-0000-4000-8000-000000000302',
      estado: 'ABIERTA',
      contactoId: 'cnt-302',
      contactoNombre: 'Cliente Conservado',
      contactoTelefono: '+573000000302',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Mensaje 2',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const lista = [conv1, conv2];
    const eventoRetirada: EventoBandeja = {
      tipo: 'CONVERSACION_RETIRADA',
      conversacionId: conv1.id,
    };

    // Caso A: Sin cursor encima (ratonEncima = false) -> Se retira de inmediato de la lista visible
    const resSinCursor = reordenarConGuardia(lista, null, eventoRetirada, false);
    expect(resSinCursor.listaVisible.map((c) => c.id)).toEqual([conv2.id]);
    expect(resSinCursor.nuevoPendiente).toBe(false);

    // Caso B: Con cursor encima (ratonEncima = true) -> No mueve la lista bajo el cursor, actualiza el buffer
    const resConCursor = reordenarConGuardia(lista, null, eventoRetirada, true);
    expect(resConCursor.listaVisible.map((c) => c.id)).toEqual([conv1.id, conv2.id]);
    expect(resConCursor.nuevoBuffer?.map((c) => c.id)).toEqual([conv2.id]);
    expect(resConCursor.nuevoPendiente).toBe(true);
  });

  // 10. calcularPermisosAsignacion (0c.35): evalúa Tomar, Soltar y Reasignar
  it('10. calcularPermisosAsignacion evalúa correctamente Tomar, Soltar y Reasignar según visibilidad', () => {
    const miId = '00000000-0000-4000-a000-000000000001';
    const otroId = '00000000-0000-4000-a000-000000000002';

    const convSinAsignar: ConversacionResumen = {
      id: '00000000-0000-4000-8000-000000000401',
      estado: 'ABIERTA',
      contactoId: 'cnt-401',
      contactoNombre: 'Sin Asignar',
      contactoTelefono: '+573000000401',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Texto',
      ultimoMensajeEn: null,
      ultimoMensajeDireccion: null,
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const convMia: ConversacionResumen = {
      ...convSinAsignar,
      id: '00000000-0000-4000-8000-000000000402',
      asignadoAId: miId,
      asignadoANombre: 'Mi Nombre',
    };

    const convAjena: ConversacionResumen = {
      ...convSinAsignar,
      id: '00000000-0000-4000-8000-000000000403',
      asignadoAId: otroId,
      asignadoANombre: 'Otro Asesor',
    };

    // Caso 1: Asesor sin ver_todas en conversación sin asignar (cola común)
    const p1 = calcularPermisosAsignacion(convSinAsignar, miId, false);
    expect(p1.puedeTomar).toBe(true);
    expect(p1.puedeSoltar).toBe(false);
    expect(p1.puedeReasignar).toBe(true); // puede asignar a un compañero desde la cola común

    // Caso 2: Asesor sin ver_todas en conversación propia
    const p2 = calcularPermisosAsignacion(convMia, miId, false);
    expect(p2.puedeTomar).toBe(false);
    expect(p2.puedeSoltar).toBe(true); // devolver a la cola común
    expect(p2.puedeReasignar).toBe(true); // traspasar a otro asesor

    // Caso 3: Asesor sin ver_todas en conversación ajena
    const p3 = calcularPermisosAsignacion(convAjena, miId, false);
    expect(p3.puedeTomar).toBe(false);
    expect(p3.puedeSoltar).toBe(false);
    expect(p3.puedeReasignar).toBe(false);

    // Caso 4: Dueño con ver_todas en conversación de otro asesor
    const p4 = calcularPermisosAsignacion(convAjena, miId, true);
    expect(p4.puedeTomar).toBe(false); // ya tiene asesor, para tomarla la reasigna
    expect(p4.puedeSoltar).toBe(true);
    expect(p4.puedeReasignar).toBe(true);
  });

  // 11. evaluarConversacionRetirada (0c.35): detecta si el evento corresponde a la conversación activa
  it('11. evaluarConversacionRetirada detecta cuando la conversación activa fue retirada', () => {
    const activaId = '00000000-0000-4000-8000-000000000501';
    const otraId = '00000000-0000-4000-8000-000000000502';

    expect(
      evaluarConversacionRetirada(activaId, {
        tipo: 'CONVERSACION_RETIRADA',
        conversacionId: activaId,
      }),
    ).toBe(true);

    expect(
      evaluarConversacionRetirada(activaId, {
        tipo: 'CONVERSACION_RETIRADA',
        conversacionId: otraId,
      }),
    ).toBe(false);

    expect(
      evaluarConversacionRetirada(activaId, {
        tipo: 'MENSAJE_NUEVO',
        conversacionId: activaId,
        mensaje: {
          id: '00000000-0000-4000-8000-000000000099',
          conversacionId: activaId,
          direccion: 'ENTRANTE',
          tipo: 'TEXTO',
          texto: 'Hola',
          adjuntos: [],
          estado: 'ENTREGADO',
          motivoFallo: null,
          autorId: null,
          autorNombre: null,
          ocurridoEn: new Date().toISOString(),
          cotizacionId: null,
        },
      }),
    ).toBe(false);
  });
});
