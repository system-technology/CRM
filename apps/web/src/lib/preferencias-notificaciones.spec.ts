import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  cargarPreferenciasNotificaciones,
  guardarPreferenciasNotificaciones,
  solicitarPermisoNotificaciones,
  emitirNotificacionNavegador,
  reproducirSonidoNotificacion,
  TITULOS_SEGUROS_NOTIFICACION,
  PREFERENCIAS_POR_DEFECTO,
} from './preferencias-notificaciones';

describe('preferencias-notificaciones (T-110)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('devuelve las preferencias por defecto (sonido y navegador apagados por omisión)', () => {
    const prefs = cargarPreferenciasNotificaciones();
    expect(prefs.sonidoHabilitado).toBe(false);
    expect(prefs.navegadorHabilitado).toBe(false);
    expect(prefs.avisoMensajesNuevos).toBe(true);
    expect(prefs.avisoSeguimientosVencidos).toBe(true);
    expect(prefs.avisoCotizacionesPorVencer).toBe(true);
  });

  it('guarda y recupera preferencias modificadas en localStorage', () => {
    guardarPreferenciasNotificaciones({
      ...PREFERENCIAS_POR_DEFECTO,
      sonidoHabilitado: true,
      navegadorHabilitado: true,
    });

    const cargadas = cargarPreferenciasNotificaciones();
    expect(cargadas.sonidoHabilitado).toBe(true);
    expect(cargadas.navegadorHabilitado).toBe(true);
  });

  it('solicita permisos de notificación usando la API del navegador', async () => {
    const mockRequestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'default',
        requestPermission: mockRequestPermission,
      },
      configurable: true,
      writable: true,
    });

    const concedido = await solicitarPermisoNotificaciones();
    expect(concedido).toBe(true);
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('NO emite notificación del navegador si el asesor la tiene deshabilitada en preferencias', () => {
    const mockNotificationConstructor = vi.fn();
    Object.defineProperty(window, 'Notification', {
      value: mockNotificationConstructor,
      configurable: true,
      writable: true,
    });

    guardarPreferenciasNotificaciones({
      ...PREFERENCIAS_POR_DEFECTO,
      navegadorHabilitado: false,
    });

    emitirNotificacionNavegador(
      TITULOS_SEGUROS_NOTIFICACION.MENSAJE_NUEVO,
      'Tienes 1 mensaje nuevo sin responder.',
      '/bandeja',
    );

    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it('emite notificación si está autorizada con título estricto sin datos personales (R10)', () => {
    const mockNotificationInstance = { onclick: null };
    const mockNotificationConstructor = vi.fn().mockImplementation(() => mockNotificationInstance);
    Object.defineProperty(mockNotificationConstructor, 'permission', {
      value: 'granted',
      configurable: true,
    });

    Object.defineProperty(window, 'Notification', {
      value: mockNotificationConstructor,
      configurable: true,
      writable: true,
    });

    guardarPreferenciasNotificaciones({
      ...PREFERENCIAS_POR_DEFECTO,
      navegadorHabilitado: true,
    });

    emitirNotificacionNavegador(
      TITULOS_SEGUROS_NOTIFICACION.SEGUIMIENTO_VENCIDO,
      'Hay una tarea pendiente programada que requiere atención.',
      '/seguimientos',
    );

    expect(mockNotificationConstructor).toHaveBeenCalledWith(
      'Seguimiento comercial vencido',
      expect.objectContaining({
        body: 'Hay una tarea pendiente programada que requiere atención.',
        icon: '/icon.svg',
      }),
    );
  });

  it('reproduce sonido sintetizado con Web Audio API solo si el asesor lo habilitó', () => {
    const mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const mockAudioContext = vi.fn().mockImplementation(() => ({
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn().mockReturnValue(mockOscillator),
      createGain: vi.fn().mockReturnValue(mockGain),
    }));

    Object.defineProperty(window, 'AudioContext', {
      value: mockAudioContext,
      configurable: true,
      writable: true,
    });

    // 1. Con sonido apagado: no debe crear AudioContext
    guardarPreferenciasNotificaciones({
      ...PREFERENCIAS_POR_DEFECTO,
      sonidoHabilitado: false,
    });
    reproducirSonidoNotificacion();
    expect(mockAudioContext).not.toHaveBeenCalled();

    // 2. Con sonido activado: debe crear osciladores y arrancar
    guardarPreferenciasNotificaciones({
      ...PREFERENCIAS_POR_DEFECTO,
      sonidoHabilitado: true,
    });
    reproducirSonidoNotificacion();
    expect(mockAudioContext).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
  });
});
