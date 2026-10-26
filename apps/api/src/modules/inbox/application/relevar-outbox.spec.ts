/**
 * El relay como productor de la cola de envíos (ADR-0018 §2), con outbox, bus y cola de mentira.
 */
import { describe, expect, it } from 'vitest';
import {
  TIPO_MENSAJE_RECIBIDO,
  TIPO_MENSAJE_SALIENTE_CREADO,
} from '../domain/evento-de-dominio.js';
import type { EventoDeDominio } from '../domain/evento-de-dominio.js';
import { PuertoColaDeEnvios } from './puertos-de-envio.js';
import {
  type EventoPendiente,
  PuertoOutbox,
  PuertoPublicadorDeEventos,
} from './puertos-de-eventos.js';
import { RelevarOutbox } from './relevar-outbox.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const SALIENTE = '01932000-0000-7000-8000-0000000000aa';
const ENTRANTE = '01932000-0000-7000-8000-0000000000ab';

class OutboxFalso extends PuertoOutbox {
  marcados = 0;
  constructor(private pendientes: EventoPendiente[]) {
    super();
  }
  async publicarPendientes(
    _t: string,
    publicar: (eventos: EventoPendiente[]) => Promise<void>,
  ): Promise<number> {
    if (this.pendientes.length === 0) return 0;
    await publicar(this.pendientes);
    // Solo se marca si publicar no lanzó: es lo que hace `OutboxPrisma` en la transacción.
    const n = this.pendientes.length;
    this.marcados += n;
    this.pendientes = [];
    return n;
  }
  tenantsParaBarrer(): Promise<string[]> {
    return Promise.resolve([TENANT]);
  }
}

class BusFalso extends PuertoPublicadorDeEventos {
  publicados: EventoDeDominio[] = [];
  publicar(e: EventoDeDominio): Promise<void> {
    this.publicados.push(e);
    return Promise.resolve();
  }
}

class ColaFalsa extends PuertoColaDeEnvios {
  encolados: string[] = [];
  falla = false;
  encolar(_t: string, mensajeId: string): Promise<void> {
    if (this.falla) return Promise.reject(new Error('Redis caído'));
    this.encolados.push(mensajeId);
    return Promise.resolve();
  }
}

const eventos = (): EventoPendiente[] => [
  {
    id: '1',
    tipo: TIPO_MENSAJE_SALIENTE_CREADO,
    tenantId: TENANT,
    agregadoId: SALIENTE,
    payload: {},
  },
  { id: '2', tipo: TIPO_MENSAJE_RECIBIDO, tenantId: TENANT, agregadoId: ENTRANTE, payload: {} },
];

describe('RelevarOutbox — encola el envío de cada respuesta del asesor', () => {
  it('solo los mensajes salientes van a la cola de envíos; todos van al bus', async () => {
    const cola = new ColaFalsa();
    const bus = new BusFalso();
    await new RelevarOutbox(new OutboxFalso(eventos()), bus, cola).vaciar(TENANT);
    expect(cola.encolados).toEqual([SALIENTE]);
    expect(bus.publicados.map((e) => e.id)).toEqual(['1', '2']);
  });

  it('si encolar falla, la tanda NO se marca publicada: se repite y no se pierde el envío', async () => {
    const cola = new ColaFalsa();
    cola.falla = true;
    const outbox = new OutboxFalso(eventos());
    await expect(new RelevarOutbox(outbox, new BusFalso(), cola).vaciar(TENANT)).rejects.toThrow();
    expect(outbox.marcados).toBe(0);
  });

  it('sin cola de envíos (pruebas del relay) solo publica', async () => {
    const bus = new BusFalso();
    await new RelevarOutbox(new OutboxFalso(eventos()), bus).vaciar(TENANT);
    expect(bus.publicados).toHaveLength(2);
  });
});
