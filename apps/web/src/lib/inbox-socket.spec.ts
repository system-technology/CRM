import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EventoBandeja } from '@viajapro/contracts';
import { InboxSocketManager } from './inbox-socket';
import { realtimeMockBus } from './realtime-mock';

const mockSocketInstance = {
  on: vi.fn(),
  io: { on: vi.fn() },
  disconnect: vi.fn(),
};

const mockIo = vi.fn((_url?: unknown, _opts?: unknown) => mockSocketInstance);

vi.mock('socket.io-client', () => ({
  io: (url?: unknown, opts?: unknown) => mockIo(url, opts),
  Socket: vi.fn(),
}));

describe('InboxSocketManager — Canal de tiempo real (0c.35, 0c.38, 0c.40)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
  });

  it('1. En modo mock (offline) se conecta al bus de simulación y despacha eventos válidos tras inicializar', () => {
    const eventos: EventoBandeja[] = [];
    const manager = new InboxSocketManager();
    manager.inicializar();

    const unsub = manager.suscribirEvento((ev) => {
      eventos.push(ev);
    });

    const convId = '00000000-0000-4000-8000-000000000601';
    realtimeMockBus.emitirMensajeNuevo(convId, 'Prueba socket tiempo real');

    unsub();
    manager.desconectar();

    const recibido = eventos[0];
    expect(recibido).toBeDefined();
    expect(recibido?.tipo).toBe('MENSAJE_NUEVO');
    if (recibido && recibido.tipo === 'MENSAJE_NUEVO') {
      expect(recibido.conversacionId).toBe(convId);
      expect(recibido.mensaje.texto).toBe('Prueba socket tiempo real');
    }
  });

  it('2. Un evento con payload desconocido se descarta en silencio registrando advertencia (safeParse R3 / 0c.40)', () => {
    let llamado = false;
    const manager = new InboxSocketManager();
    manager.inicializar();

    const unsub = manager.suscribirEvento(() => {
      llamado = true;
    });

    // Despachar evento con esquema inválido
    realtimeMockBus.emitirEventoDesconocido();

    unsub();
    manager.desconectar();

    expect(llamado).toBe(false);
  });

  it('3. Despacha evento CONVERSACION_RETIRADA a los suscriptores tras inicializar', () => {
    const eventos: EventoBandeja[] = [];
    const manager = new InboxSocketManager();
    manager.inicializar();

    const unsub = manager.suscribirEvento((ev) => {
      eventos.push(ev);
    });

    const convId = '00000000-0000-4000-8000-000000000602';
    realtimeMockBus.emitirConversacionRetirada(convId);

    unsub();
    manager.desconectar();

    const recibido = eventos[0];
    expect(recibido).toBeDefined();
    expect(recibido?.tipo).toBe('CONVERSACION_RETIRADA');
    if (recibido && recibido.tipo === 'CONVERSACION_RETIRADA') {
      expect(recibido.conversacionId).toBe(convId);
    }
  });

  it('4. Notifica reconexión a los suscriptores cuando se restablece la conexión', () => {
    let reconectado = false;
    const manager = new InboxSocketManager();

    const unsub = manager.suscribirReconexion(() => {
      reconectado = true;
    });

    manager.notificarReconexion();

    unsub();
    manager.desconectar();

    expect(reconectado).toBe(true);
  });

  it('5. Notifica cambios de estado de conexión (conectado -> reconectando -> desconectado)', () => {
    const estados: string[] = [];
    const manager = new InboxSocketManager();

    const unsub = manager.suscribirEstado((est) => {
      estados.push(est);
    });

    manager.notificarCambioEstado('reconectando');
    manager.notificarCambioEstado('conectado');

    unsub();
    manager.desconectar();

    expect(estados).toContain('reconectando');
    expect(estados).toContain('conectado');
  });

  it('6. El constructor NO se conecta al socket automáticamente (0c.40)', () => {
    process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = 'true';

    const manager = new InboxSocketManager();

    // Invariante 0c.40: al instanciarse (o importarse en /ingresar), cero peticiones de socket
    expect(mockIo).not.toHaveBeenCalled();
    expect(manager.getEstado()).toBe('desconectado');
    expect(manager.getConsumidoresActivos()).toBe(0);
  });

  it('7. Conecta exclusivamente al registrar consumidor y desconecta al liberar todos los consumidores (0c.40)', () => {
    process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = 'true';

    const manager = new InboxSocketManager();
    expect(mockIo).not.toHaveBeenCalled();

    // 1. Monta primer consumidor (ej. ListaConversaciones)
    manager.registrarConsumidor();
    expect(manager.getConsumidoresActivos()).toBe(1);
    expect(mockIo).toHaveBeenCalledTimes(1);

    // 2. Monta segundo consumidor simultáneo (ej. Hilo de conversación en /bandeja/[id])
    manager.registrarConsumidor();
    expect(manager.getConsumidoresActivos()).toBe(2);
    // No crea otra conexión, reutiliza la existente
    expect(mockIo).toHaveBeenCalledTimes(1);

    // 3. Desmonta un consumidor (ej. regresa de la conversación a la lista)
    manager.liberarConsumidor();
    expect(manager.getConsumidoresActivos()).toBe(1);
    expect(mockSocketInstance.disconnect).not.toHaveBeenCalled();

    // 4. Desmonta el último consumidor (ej. navega fuera de la bandeja a /pipeline o /ingresar)
    manager.liberarConsumidor();
    expect(manager.getConsumidoresActivos()).toBe(0);
    expect(mockSocketInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(manager.getEstado()).toBe('desconectado');
  });

  it('8. desconectar() explícito (ej. al cerrar sesión) corta la conexión y resetea estado (0c.40)', () => {
    process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = 'true';

    const manager = new InboxSocketManager();
    manager.registrarConsumidor();
    expect(manager.getConsumidoresActivos()).toBe(1);

    manager.desconectar();
    expect(mockSocketInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(manager.getConsumidoresActivos()).toBe(0);
    expect(manager.getEstado()).toBe('desconectado');
  });
});
