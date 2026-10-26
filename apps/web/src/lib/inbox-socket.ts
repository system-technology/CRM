'use client';

import { io, Socket } from 'socket.io-client';
import {
  EventoBandeja,
  EVENTO_SOCKET_BANDEJA,
  EVENTO_SOCKET_CIERRE,
  RUTA_SOCKET_BANDEJA,
} from '@viajapro/contracts';
import { estaUsandoApiRealInbox } from './inbox-api';
import { realtimeMockBus } from './realtime-mock';
import { useEffect, useState, useRef } from 'react';

export type EstadoConexionSocket = 'conectado' | 'reconectando' | 'desconectado';
export type ListenerBandeja = (evento: EventoBandeja) => void;
export type ListenerReconexion = () => void;

export class InboxSocketManager {
  private socket: Socket | null = null;
  private listeners: Set<ListenerBandeja> = new Set();
  private reconexionListeners: Set<ListenerReconexion> = new Set();
  private estadoListeners: Set<(estado: EstadoConexionSocket) => void> = new Set();
  private estadoActual: EstadoConexionSocket = 'desconectado';
  private intentoReconexion = false;
  private mockUnsubscribe: (() => void) | null = null;

  private consumidoresActivos = 0;

  constructor() {
    // 0c.40: El constructor NO se conecta al socket automáticamente.
    // La conexión se inicia exclusivamente desde useInboxSocket cuando hay bandeja y sesión activa.
  }

  public getConsumidoresActivos(): number {
    return this.consumidoresActivos;
  }

  public registrarConsumidor(): void {
    this.consumidoresActivos++;
    if (this.consumidoresActivos === 1) {
      this.inicializar();
    }
  }

  public liberarConsumidor(): void {
    this.consumidoresActivos = Math.max(0, this.consumidoresActivos - 1);
    if (this.consumidoresActivos === 0) {
      this.desconectar();
    }
  }

  public getEstado(): EstadoConexionSocket {
    return this.estadoActual;
  }

  public inicializar(): void {
    if (this.socket || this.mockUnsubscribe) {
      return;
    }

    if (!estaUsandoApiRealInbox()) {
      // Modo Mock: nos conectamos al realtimeMockBus
      this.estadoActual = 'conectado';
      this.mockUnsubscribe = realtimeMockBus.subscribe((evento: EventoBandeja) => {
        this.notificarEvento(evento);
      });
      this.notificarCambioEstado('conectado');
      return;
    }

    // Modo Real: Socket.IO
    // ADR-0001, ADR-0011:
    // El cliente se conecta con withCredentials (cookie de sesión HttpOnly).
    // NUNCA mandar tenantId ni sala en el handshake o payload (el servidor los asigna).
    const baseUrl =
      process.env['NEXT_PUBLIC_API_URL'] ||
      (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3333'
        : undefined);

    const socketInstance = baseUrl
      ? io(baseUrl, {
          path: RUTA_SOCKET_BANDEJA,
          withCredentials: true,
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        })
      : io({
          path: RUTA_SOCKET_BANDEJA,
          withCredentials: true,
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

    this.socket = socketInstance;

    socketInstance.on('connect', () => {
      const eraReconexion = this.intentoReconexion;
      this.intentoReconexion = false;
      this.estadoActual = 'conectado';
      this.notificarCambioEstado('conectado');

      if (eraReconexion) {
        this.notificarReconexion();
      }
    });

    socketInstance.on('disconnect', (_motivo) => {
      this.intentoReconexion = true;
      this.estadoActual = 'desconectado';
      this.notificarCambioEstado('desconectado');
    });

    socketInstance.io.on('reconnect_attempt', () => {
      this.intentoReconexion = true;
      this.estadoActual = 'reconectando';
      this.notificarCambioEstado('reconectando');
    });

    socketInstance.io.on('reconnect', () => {
      this.intentoReconexion = false;
      this.estadoActual = 'conectado';
      this.notificarCambioEstado('conectado');
      this.notificarReconexion();
    });

    socketInstance.on('connect_error', () => {
      if (this.intentoReconexion) {
        this.estadoActual = 'reconectando';
        this.notificarCambioEstado('reconectando');
      } else {
        this.estadoActual = 'desconectado';
        this.notificarCambioEstado('desconectado');
      }
    });

    // Eventos de la bandeja: discriminados por tipo, eventos desconocidos se registran con warn (R3)
    socketInstance.on(EVENTO_SOCKET_BANDEJA, (payload: unknown) => {
      const parseado = EventoBandeja.safeParse(payload);
      if (!parseado.success) {
        console.warn(
          '[InboxSocketManager] Evento de socket descartado por no cumplir contrato Zod:',
          parseado.error,
        );
        return;
      }
      this.notificarEvento(parseado.data);
    });

    // Cierre de sesión forzado desde el servidor (ADR-0011)
    socketInstance.on(EVENTO_SOCKET_CIERRE, (datos: { motivo?: string }) => {
      if (typeof window !== 'undefined') {
        const query = datos?.motivo ? `?motivo=${encodeURIComponent(datos.motivo)}` : '';
        window.location.href = `/ingresar${query}`;
      }
    });
  }

  public suscribirEvento(listener: ListenerBandeja): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public suscribirReconexion(listener: ListenerReconexion): () => void {
    this.reconexionListeners.add(listener);
    return () => {
      this.reconexionListeners.delete(listener);
    };
  }

  public suscribirEstado(listener: (estado: EstadoConexionSocket) => void): () => void {
    this.estadoListeners.add(listener);
    listener(this.estadoActual);
    return () => {
      this.estadoListeners.delete(listener);
    };
  }

  public notificarEvento(evento: unknown): void {
    const parseado = EventoBandeja.safeParse(evento);
    if (!parseado.success) {
      console.warn(
        '[InboxSocketManager] Evento descartado por no cumplir contrato Zod:',
        parseado.error,
      );
      return;
    }
    const eventoValido = parseado.data;
    this.listeners.forEach((listener) => {
      try {
        listener(eventoValido);
      } catch (e) {
        console.error('[InboxSocketManager] Error en listener de evento:', e);
      }
    });
  }

  public notificarReconexion(): void {
    this.reconexionListeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('[InboxSocketManager] Error en listener de reconexión:', e);
      }
    });
  }

  public notificarCambioEstado(estado: EstadoConexionSocket): void {
    this.estadoActual = estado;
    this.estadoListeners.forEach((listener) => {
      try {
        listener(estado);
      } catch (e) {
        console.error('[InboxSocketManager] Error en listener de estado:', e);
      }
    });
  }

  public desconectar(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.mockUnsubscribe) {
      this.mockUnsubscribe();
      this.mockUnsubscribe = null;
    }
    this.consumidoresActivos = 0;
    this.estadoActual = 'desconectado';
    this.intentoReconexion = false;
    this.notificarCambioEstado('desconectado');
  }
}

export const inboxSocketManager = new InboxSocketManager();

if (typeof window !== 'undefined') {
  (window as unknown as { __inboxSocketManager?: InboxSocketManager }).__inboxSocketManager =
    inboxSocketManager;
}

export function useInboxSocket(opciones?: {
  onEvento?: ListenerBandeja;
  onReconexion?: ListenerReconexion;
}): { estado: EstadoConexionSocket } {
  const [estado, setEstado] = useState<EstadoConexionSocket>(() => inboxSocketManager.getEstado());
  const onEventoRef = useRef(opciones?.onEvento);
  const onReconexionRef = useRef(opciones?.onReconexion);

  useEffect(() => {
    onEventoRef.current = opciones?.onEvento;
    onReconexionRef.current = opciones?.onReconexion;
  }, [opciones?.onEvento, opciones?.onReconexion]);

  useEffect(() => {
    inboxSocketManager.registrarConsumidor();

    const unsubEstado = inboxSocketManager.suscribirEstado((nuevoEstado) => {
      setEstado(nuevoEstado);
    });

    const unsubEvento = inboxSocketManager.suscribirEvento((evento) => {
      onEventoRef.current?.(evento);
    });

    const unsubReconexion = inboxSocketManager.suscribirReconexion(() => {
      onReconexionRef.current?.();
    });

    return () => {
      unsubEstado();
      unsubEvento();
      unsubReconexion();
      inboxSocketManager.liberarConsumidor();
    };
  }, []);

  return { estado };
}
