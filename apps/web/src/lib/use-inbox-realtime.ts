import { useEffect } from 'react';
import { EventoBandeja, type Mensaje, type ConversacionResumen } from '@viajapro/contracts';

interface InboxRealtimeHandlers {
  onMensajeNuevo?: (conversacionId: string, mensaje: Mensaje) => void;
  onMensajeActualizado?: (
    conversacionId: string,
    mensajeId: string,
    estado: string,
    motivoFallo: string | null,
  ) => void;
  onConversacionActualizada?: (conversacion: ConversacionResumen) => void;
}

/**
 * Hook para procesar eventos de tiempo real de la bandeja (`EventoBandeja`).
 *
 * **Regla del contrato R3:** Los eventos desconocidos se ignoran en silencio.
 * El servidor puede publicar tipos nuevos antes de que la web sepa pintarlos,
 * por lo que fallar al parsear un evento no soportado detendría la ejecución de la UI.
 */
export function useInboxRealtime(handlers: InboxRealtimeHandlers) {
  useEffect(() => {
    // Escucha eventos emitidos en ventana o por WebSocket simulado
    const manejarEventoRaw = (e: Event) => {
      const customEv = e as CustomEvent<unknown>;
      const parsed = EventoBandeja.safeParse(customEv.detail);
      if (!parsed.success) {
        // Evento desconocido o no válido: se ignora en silencio por contrato
        return;
      }

      const evento = parsed.data;
      switch (evento.tipo) {
        case 'MENSAJE_NUEVO':
          handlers.onMensajeNuevo?.(evento.conversacionId, evento.mensaje);
          break;
        case 'MENSAJE_ACTUALIZADO':
          handlers.onMensajeActualizado?.(
            evento.conversacionId,
            evento.mensajeId,
            evento.estado,
            evento.motivoFallo,
          );
          break;
        case 'CONVERSACION_ACTUALIZADA':
          handlers.onConversacionActualizada?.(evento.conversacion);
          break;
      }
    };

    window.addEventListener('viajapro:inbox-event', manejarEventoRaw);
    return () => {
      window.removeEventListener('viajapro:inbox-event', manejarEventoRaw);
    };
  }, [handlers]);
}

/**
 * Función de utilidad para simular o publicar un evento de tiempo real en el cliente.
 */
export function emitirEventoBandeja(evento: unknown) {
  const customEv = new CustomEvent('viajapro:inbox-event', { detail: evento });
  window.dispatchEvent(customEv);
}
