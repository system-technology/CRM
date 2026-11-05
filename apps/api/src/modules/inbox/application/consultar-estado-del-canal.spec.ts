import type { CanalWhatsappEstado } from '@viajapro/contracts';
import { EstadoCanalWhatsapp } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { ConsultarEstadoDelCanal } from './consultar-estado-del-canal.js';

const canal = (conectado: boolean): CanalWhatsappEstado => ({
  id: '01932000-0000-7000-8000-00000000000a',
  numeroE164: '+573001234567',
  nombreVisible: null,
  estado: conectado ? 'ACTIVO' : 'SUSPENDIDO',
  estadoCuenta: 'ACTIVO',
  conectado,
  conectadoDesde: '2026-11-01T10:00:00.000Z',
  ultimaRecepcionEn: null,
  ultimoEnvioFallido: null,
});

const con = (canales: CanalWhatsappEstado[]): ConsultarEstadoDelCanal =>
  new ConsultarEstadoDelCanal({
    canalesDeLaAgencia: () => Promise.resolve(canales),
  });

describe('ConsultarEstadoDelCanal', () => {
  it('sin números: no conectado y lista vacía', async () => {
    expect(await con([]).ejecutar()).toEqual({ conectado: false, canales: [] });
  });

  it('conectado si al menos un número lo está', async () => {
    expect((await con([canal(false), canal(true)]).ejecutar()).conectado).toBe(true);
    expect((await con([canal(false)]).ejecutar()).conectado).toBe(false);
  });

  it('la respuesta cumple el contrato', async () => {
    expect(EstadoCanalWhatsapp.safeParse(await con([canal(true)]).ejecutar()).success).toBe(true);
  });
});
