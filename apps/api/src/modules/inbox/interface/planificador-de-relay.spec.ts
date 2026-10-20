/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
import { describe, expect, it } from 'vitest';
import { RelevarOutbox } from '../application/relevar-outbox.js';
import { PuertoAvisoDeOutbox } from '../application/puertos-de-eventos.js';
import { AvisosDeOutboxEnMemoria } from '../infrastructure/avisos-de-outbox.en-memoria.js';
import { PlanificadorDeRelay } from './planificador-de-relay.js';

class RelevoFalso {
  vaciados: string[] = [];
  barridos = 0;
  fallarCon: string | null = null;
  async vaciar(tenantId: string): Promise<number> {
    if (this.fallarCon === tenantId) throw new Error('Redis caído');
    this.vaciados.push(tenantId);
    return 1;
  }
  async barrer(): Promise<number> {
    this.barridos += 1;
    return 0;
  }
}

const armar = (pistas: PuertoAvisoDeOutbox = new AvisosDeOutboxEnMemoria()) => {
  const relevo = new RelevoFalso();
  return {
    relevo,
    pistas,
    plan: new PlanificadorDeRelay(relevo as unknown as RelevarOutbox, pistas),
  };
};

describe('AvisosDeOutboxEnMemoria', () => {
  it('junta los tenants avisados sin repetirlos, y se vacía al tomarlos', () => {
    const pistas = new AvisosDeOutboxEnMemoria();
    pistas.avisar('a');
    pistas.avisar('a');
    pistas.avisar('b');
    expect(pistas.tomarAvisos().sort()).toEqual(['a', 'b']);
    expect(pistas.tomarAvisos()).toEqual([]);
  });
});

describe('PlanificadorDeRelay', () => {
  it('vacía solo las agencias avisadas', async () => {
    const { plan, pistas, relevo } = armar();
    pistas.avisar('a');
    await plan.tickDeAvisos();
    expect(relevo.vaciados).toEqual(['a']);
    await plan.tickDeAvisos();
    expect(relevo.vaciados).toEqual(['a']);
  });

  it('si el relay falla, repone la pista y no lanza; un tenant que falla no frena a otro', async () => {
    const { plan, pistas, relevo } = armar();
    relevo.fallarCon = 'a';
    pistas.avisar('a');
    pistas.avisar('b');
    await expect(plan.tickDeAvisos()).resolves.toBeUndefined();
    expect(relevo.vaciados).toEqual(['b']);
    expect(pistas.tomarAvisos()).toEqual(['a']);
  });

  it('el barrido nunca lanza', async () => {
    const { plan, relevo } = armar();
    relevo.barrer = async () => {
      throw new Error('boom');
    };
    await expect(plan.tickDeBarrido()).resolves.toBeUndefined();
  });
});
