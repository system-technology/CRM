/**
 * Emisor simulado de tiempo real para EventoBandeja (@viajapro/contracts).
 *
 * Simula la llegada de eventos vía WebSocket o SSE en la bandeja de entrada.
 * Cumple con la regla de producto:
 * - .safeParse() para validar.
 * - Descarte silencioso si el evento es de un tipo desconocido o no cumple el contrato.
 */

import {
  EventoBandeja,
  type Mensaje,
  type ConversacionResumen,
  type EstadoMensaje,
} from '@viajapro/contracts';

type Listener = (evento: EventoBandeja) => void;

class RealtimeMockBus {
  private listeners: Set<Listener> = new Set();
  private autoInterval: ReturnType<typeof setInterval> | null = null;
  private autoActivo = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispatchRaw(rawPayload: unknown): boolean {
    const parsed = EventoBandeja.safeParse(rawPayload);
    if (!parsed.success) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[RealtimeMockBus] Evento descartado en silencio (no coincide con EventoBandeja):',
          rawPayload,
        );
      }
      return false;
    }

    const evento = parsed.data;
    this.listeners.forEach((listener) => {
      try {
        listener(evento);
      } catch (err) {
        console.error('[RealtimeMockBus] Error en listener al procesar evento:', err);
      }
    });
    return true;
  }

  emitirMensajeNuevo(
    conversacionId: string,
    texto: string,
    direccion: 'ENTRANTE' | 'SALIENTE' = 'ENTRANTE',
  ): Mensaje {
    const ahora = new Date().toISOString();
    const id = '00000000-0000-4000-8000-' + Date.now().toString(16).slice(-12);

    const mensaje: Mensaje = {
      id,
      conversacionId,
      direccion,
      tipo: 'TEXTO',
      texto,
      adjuntos: [],
      estado: direccion === 'ENTRANTE' ? 'ENTREGADO' : 'PENDIENTE',
      motivoFallo: null,
      autorId: direccion === 'SALIENTE' ? '00000000-0000-4000-a000-000000000001' : null,
      autorNombre: direccion === 'SALIENTE' ? 'Asesor Actual' : null,
      ocurridoEn: ahora,
    };

    this.dispatchRaw({
      tipo: 'MENSAJE_NUEVO',
      conversacionId,
      mensaje,
    });

    return mensaje;
  }

  emitirMensajeActualizado(
    conversacionId: string,
    mensajeId: string,
    estado: EstadoMensaje,
    motivoFallo: string | null = null,
  ): void {
    this.dispatchRaw({
      tipo: 'MENSAJE_ACTUALIZADO',
      conversacionId,
      mensajeId,
      estado,
      motivoFallo,
    });
  }

  emitirConversacionActualizada(conversacion: ConversacionResumen): void {
    this.dispatchRaw({
      tipo: 'CONVERSACION_ACTUALIZADA',
      conversacion,
    });
  }

  emitirEventoDesconocido(): boolean {
    const payloadDesconocido = {
      tipo: 'CLIENTE_UBICACION_COMPARTIDA_V2',
      latitud: 4.6097,
      longitud: -74.0817,
      detalles: 'Evento futuro no registrado en el esquema Zod actual',
    };
    return this.dispatchRaw(payloadDesconocido);
  }

  toggleAutoSimulacion(
    conversacionesEjemplo: ConversacionResumen[],
    onStatusChange?: (activo: boolean) => void,
  ): void {
    if (this.autoActivo) {
      if (this.autoInterval) clearInterval(this.autoInterval);
      this.autoInterval = null;
      this.autoActivo = false;
      if (onStatusChange) onStatusChange(false);
      return;
    }

    this.autoActivo = true;
    if (onStatusChange) onStatusChange(true);

    const FRASES_SIMULADAS = [
      '¿Tienen cupo para salida en puente festivo?',
      'Me interesa el plan con vuelo incluido.',
      '¿Me pueden reenviar la cotización en PDF por favor?',
      'Acabo de transferir la reserva, ¿me confirman?',
      'Hola, ¿cuánto cuesta el boleto adicional para niño?',
    ];

    this.autoInterval = setInterval(() => {
      if (!conversacionesEjemplo.length) return;
      const index = Math.floor(Math.random() * Math.min(10, conversacionesEjemplo.length));
      const convRandom = conversacionesEjemplo[index];
      const textoRandom = FRASES_SIMULADAS[Math.floor(Math.random() * FRASES_SIMULADAS.length)];
      if (convRandom && convRandom.id && textoRandom) {
        this.emitirMensajeNuevo(convRandom.id, textoRandom, 'ENTRANTE');
      }
    }, 8000);
  }

  isAutoActivo(): boolean {
    return this.autoActivo;
  }
}

export const realtimeMockBus = new RealtimeMockBus();
