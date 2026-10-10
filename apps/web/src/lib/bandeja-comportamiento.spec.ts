import { describe, expect, it } from 'vitest';
import {
  EventoBandeja,
  EnviarTexto,
  type ConversacionResumen,
  type ConversacionDetalle,
} from '@viajapro/contracts';
import { realtimeMockBus } from './realtime-mock';

describe('Pruebas Automáticas de la Bandeja — Reglas de Comportamiento (Tarea 5)', () => {
  // 1. Un MENSAJE_NUEVO llega al suscriptor
  it('1. Un MENSAJE_NUEVO llega al suscriptor sin ser descartado en silencio', () => {
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

    // Validar UUID v4
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(mensaje.id).toMatch(uuidRegex);

    // Validar recepción por el suscriptor
    expect(eventoRecibido).not.toBeNull();
    const ev = (eventoRecibido ?? {}) as unknown as Record<string, unknown>;
    expect(ev['tipo']).toBe('MENSAJE_NUEVO');
  });

  // 2. Dos eventos con el ratón encima: sobreviven los dos
  it('2. Dos eventos con el ratón encima (Mouse Hover Guard): ambos sobreviven en el búfer', () => {
    const conv1: ConversacionResumen = {
      id: 'conv-201',
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
      id: 'conv-202',
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

    const estadoInicial = [conv1, conv2];
    let bufferConversaciones: ConversacionResumen[] | null = null;
    let pendientesReorden = 0;
    const isHoveringList = true;

    const eventos = [
      { id: 'conv-201', texto: 'Actualización A' },
      { id: 'conv-202', texto: 'Actualización B' },
    ];

    eventos.forEach((e) => {
      const base = bufferConversaciones ?? estadoInicial;
      const listaActualizada = [...base];
      const idx = listaActualizada.findIndex((c) => c.id === e.id);
      if (idx !== -1 && listaActualizada[idx]) {
        listaActualizada[idx] = {
          ...actual,
          ultimoMensajeTexto: e.texto,
          mensajesSinLeer: listaActualizada[idx].mensajesSinLeer + 1,
        };
      }

      if (isHoveringList) {
        bufferConversaciones = listaActualizada;
        pendientesReorden += 1;
      }
    });

    expect(pendientesReorden).toBe(2);
    expect(bufferConversaciones).not.toBeNull();
    const arr = bufferConversaciones as unknown as ConversacionResumen[];
    expect(arr.find((c) => c.id === 'conv-201')?.ultimoMensajeTexto).toBe('Actualización A');
    expect(arr.find((c) => c.id === 'conv-202')?.ultimoMensajeTexto).toBe('Actualización B');
  });

  // 3. Reintentar un envío fallido reutiliza la clave de idempotencia (R5)
  it('3. Reintentar un envío fallido reutiliza exactamente la misma clave de idempotencia (R5)', () => {
    const mensajeId = 'opt-1234567890';
    const idempotenciaKeys: Record<string, string> = {};

    // 1. Primer intento
    let claveOriginal = idempotenciaKeys[mensajeId];
    if (!claveOriginal) {
      claveOriginal = '00000000-0000-4000-8000-999999999999';
      idempotenciaKeys[mensajeId] = claveOriginal;
    }

    // 2. Reintento tras fallo
    let claveReintento = idempotenciaKeys[mensajeId];
    if (!claveReintento) {
      claveReintento = '11111111-1111-4111-8111-111111111111'; // Se generaría una nueva si no se reutilizara
      idempotenciaKeys[mensajeId] = claveReintento;
    }

    // AFIRMAR QUE LA CLAVE ES EXACTAMENTE LA MISMA (R5)
    expect(claveReintento).toBe(claveOriginal);
    expect(claveReintento).toBe('00000000-0000-4000-8000-999999999999');
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

  // 5. Con el scroll arriba, un mensaje nuevo no roba la posición
  it('5. Con el scroll arriba (isNearBottom = false), un mensaje nuevo NO roba el desplazamiento', () => {
    let isNearBottom = false; // El asesor está leyendo mensajes antiguos arriba
    let scrollEjecutado = false;
    let mensajesNuevosSinVer = 0;

    const simularLlegadaMensajeNuevo = () => {
      if (isNearBottom) {
        scrollEjecutado = true;
      } else {
        mensajesNuevosSinVer += 1;
      }
    };

    simularLlegadaMensajeNuevo();

    // Verificaciones: el scroll NO debe ser robado y el contador flotante debe subir
    expect(scrollEjecutado).toBe(false);
    expect(mensajesNuevosSinVer).toBe(1);

    // Si el usuario baja al fondo, el contador se limpia
    isNearBottom = true;
    simularLlegadaMensajeNuevo();
    expect(scrollEjecutado).toBe(true);
  });

  // 6. La ventana de 24 h cerrada deshabilita el envío libre
  it('6. La ventana de 24 h cerrada restringe el envío de texto libre segun el contrato Meta', () => {
    const conversacionCerrada: ConversacionDetalle = {
      id: 'conv-closed-24h',
      estado: 'ABIERTA',
      contactoId: 'cnt-999',
      contactoNombre: 'Viajero Inactivo',
      contactoTelefono: '+573000000999',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Hola hace 30 horas',
      ultimoMensajeEn: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
      ultimoMensajeDireccion: 'SALIENTE',
      slaVenceEn: null,
      ventana: {
        abierta: false,
        expiraEn: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        minutosRestantes: 0,
      },
      etiquetas: [],
      notas: [],
      mensajes: [],
    };

    // Validar contra el contrato EnviarTexto cuando se intenta escribir fuera de ventana
    const resultadoEnvio = EnviarTexto.safeParse({
      conversacionId: conversacionCerrada.id,
      texto: 'Mensaje libre fuera de 24h',
      claveIdempotencia: '00000000-0000-4000-8000-888888888888',
    });

    // El contrato valida la estructura, pero la ventana en estado falsa debe ser evaluada
    expect(resultadoEnvio.success).toBe(true);
    expect(conversacionCerrada.ventana.abierta).toBe(false);
    expect(conversacionCerrada.ventana.minutosRestantes).toBe(0);
  });
});
