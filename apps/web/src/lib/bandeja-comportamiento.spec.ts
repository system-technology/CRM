import { describe, expect, it } from 'vitest';
import { EventoBandeja, type ConversacionResumen } from '@viajapro/contracts';
import { realtimeMockBus } from './realtime-mock';
import {
  reordenarConGuardia,
  claveDeReintento,
  debeBajarElScroll,
  calcularTiempoRestanteVentana,
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
});
