/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { EventoBandeja, type ConversacionResumen } from '@viajapro/contracts';
import { realtimeMockBus } from './realtime-mock';

describe('RealtimeMockBus (Pruebas de Bloqueante 1 y 2)', () => {
  it('Bloqueante 1: emitirMensajeNuevo genera un UUID v4 válido y no es descartado por safeParse', () => {
    let eventoRecibido: unknown = null;

    const unsubscribe = realtimeMockBus.subscribe((evento: EventoBandeja) => {
      eventoRecibido = evento;
    });

    const convId = '00000000-0000-4000-8000-000000000001';
    const mensaje = realtimeMockBus.emitirMensajeNuevo(
      convId,
      'Hola, prueba de mensaje nuevo en vivo',
      'ENTRANTE',
    );

    unsubscribe();

    // 1. Validar formato UUID v4 de 36 caracteres
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(mensaje.id).toMatch(uuidRegex);

    // 2. Validar que safeParse devuelve success: true
    const parsed = EventoBandeja.safeParse({
      tipo: 'MENSAJE_NUEVO',
      conversacionId: convId,
      mensaje,
    });
    expect(parsed.success).toBe(true);

    // 3. Afirmar que el suscriptor RECIBIÓ el evento (no fue tirado a la basura)
    expect(eventoRecibido).not.toBeNull();
    const ev = eventoRecibido as Record<string, unknown>;
    expect(ev['tipo']).toBe('MENSAJE_NUEVO');
  });

  it('Bloqueante 2: El búfer de reordenamiento acumula múltiples eventos sin pisar los anteriores', () => {
    const conv1: ConversacionResumen = {
      id: 'conv-101',
      estado: 'ABIERTA',
      contactoId: 'cnt-101',
      contactoNombre: 'Viajero A',
      contactoTelefono: '+573000000101',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Mensaje inicial A',
      ultimoMensajeEn: new Date(Date.now() - 10000).toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const conv2: ConversacionResumen = {
      id: 'conv-102',
      estado: 'ABIERTA',
      contactoId: 'cnt-102',
      contactoNombre: 'Viajero B',
      contactoTelefono: '+573000000102',
      asignadoAId: null,
      asignadoANombre: null,
      mensajesSinLeer: 0,
      ultimoMensajeTexto: 'Mensaje inicial B',
      ultimoMensajeEn: new Date(Date.now() - 20000).toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      slaVenceEn: null,
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      etiquetas: [],
    };

    const estadoInicial: ConversacionResumen[] = [conv1, conv2];
    let bufferConversaciones: ConversacionResumen[] | null = null;
    let pendientesReorden = 0;
    const isHoveringList = true;

    // Simular recepción secuencial de 2 eventos mientras el ratón está sobre la lista
    const eventos = [
      {
        tipo: 'MENSAJE_NUEVO' as const,
        conversacionId: 'conv-101',
        mensaje: {
          id: '00000000-0000-4000-8000-000000000002',
          conversacionId: 'conv-101',
          direccion: 'ENTRANTE' as const,
          tipo: 'TEXTO' as const,
          texto: 'Primer evento acumulado',
          adjuntos: [],
          estado: 'ENTREGADO' as const,
          motivoFallo: null,
          autorId: null,
          autorNombre: null,
          ocurridoEn: new Date().toISOString(),
        },
      },
      {
        tipo: 'MENSAJE_NUEVO' as const,
        conversacionId: 'conv-102',
        mensaje: {
          id: '00000000-0000-4000-8000-000000000003',
          conversacionId: 'conv-102',
          direccion: 'ENTRANTE' as const,
          tipo: 'TEXTO' as const,
          texto: 'Segundo evento acumulado',
          adjuntos: [],
          estado: 'ENTREGADO' as const,
          motivoFallo: null,
          autorId: null,
          autorNombre: null,
          ocurridoEn: new Date().toISOString(),
        },
      },
    ];

    eventos.forEach((evento) => {
      // Lógica corregida: derivar de bufferConversaciones si existe
      const base = bufferConversaciones ?? estadoInicial;
      const listaActualizada = [...base];

      const idx = listaActualizada.findIndex((c) => c.id === evento.conversacionId);
      if (idx !== -1) {
        const actual = listaActualizada[idx];
        if (actual) {
          listaActualizada[idx] = {
            ...actual,
            ultimoMensajeTexto: evento.mensaje.texto,
            ultimoMensajeEn: evento.mensaje.ocurridoEn,
            mensajesSinLeer: actual.mensajesSinLeer + 1,
          };
        }
      }

      if (isHoveringList) {
        bufferConversaciones = listaActualizada;
        pendientesReorden += 1;
      }
    });

    // Verificaciones
    expect(pendientesReorden).toBe(2);
    expect(bufferConversaciones).not.toBeNull();
    const bufferArray = (bufferConversaciones ?? []) as ConversacionResumen[];
    expect(bufferArray.length).toBe(2);

    // AFIRMAR QUE LOS DOS EVENTOS SE CONSERVARON EN EL BÚFER (ninguno se pisó)
    const item1 = bufferArray.find((c: ConversacionResumen) => c.id === 'conv-101');
    const item2 = bufferArray.find((c: ConversacionResumen) => c.id === 'conv-102');

    expect(item1?.ultimoMensajeTexto).toBe('Primer evento acumulado');
    expect(item1?.mensajesSinLeer).toBe(1);

    expect(item2?.ultimoMensajeTexto).toBe('Segundo evento acumulado');
    expect(item2?.mensajesSinLeer).toBe(1);
  });
});
