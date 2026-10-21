import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EventoBandeja } from '@viajapro/contracts';
import { InboxSocketManager } from './inbox-socket';
import { realtimeMockBus } from './realtime-mock';

describe('InboxSocketManager — Canal de tiempo real (0c.35)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. En modo mock (offline) se conecta al bus de simulación y despacha eventos válidos', () => {
    const eventos: EventoBandeja[] = [];
    const manager = new InboxSocketManager();

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

  it('2. Un evento con payload desconocido se descarta en silencio (safeParse R3)', () => {
    let llamado = false;
    const manager = new InboxSocketManager();

    const unsub = manager.suscribirEvento(() => {
      llamado = true;
    });

    // Despachar evento con esquema inválido
    realtimeMockBus.emitirEventoDesconocido();

    unsub();
    manager.desconectar();

    expect(llamado).toBe(false);
  });

  it('3. Despacha evento CONVERSACION_RETIRADA a los suscriptores', () => {
    const eventos: EventoBandeja[] = [];
    const manager = new InboxSocketManager();

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
});
