import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PuertoColaDeEnvios, PuertoEnviosSinResolver } from './puertos-de-envio.js';
import type { PuertoMensajesSalientes } from './puertos-de-envio.js';
import type { PuertoAvisoDeOutbox, PuertoOutbox } from './puertos-de-eventos.js';
import { RecuperarEnviosSinResolver } from './recuperar-envios-sin-resolver.js';

const T1 = '01932000-0000-7000-8000-000000000001';
const T2 = '01932000-0000-7000-8000-000000000002';

class SinResolverFalso extends PuertoEnviosSinResolver {
  listos = new Map<string, string[]>();
  sinConfirmar = new Map<string, string[]>();
  listarListos(t: string): Promise<string[]> {
    return Promise.resolve(this.listos.get(t) ?? []);
  }
  listarSinConfirmar(t: string): Promise<string[]> {
    return Promise.resolve(this.sinConfirmar.get(t) ?? []);
  }
}

class ColaFalsa extends PuertoColaDeEnvios {
  encolados: Array<[string, string]> = [];
  encolar(t: string, m: string): Promise<void> {
    this.encolados.push([t, m]);
    return Promise.resolve();
  }
}

function montar() {
  const sin = new SinResolverFalso();
  const cola = new ColaFalsa();
  const fallos: Array<{ t: string; m: string; codigoMeta: number | null; message: string }> = [];
  const registrarFallo = vi.fn(
    (t: string, m: string, e: { codigoMeta: number | null; message: string }) => {
      fallos.push({ t, m, ...e });
      return Promise.resolve(true);
    },
  );
  const mensajes = { registrarFallo } as unknown as PuertoMensajesSalientes;
  const avisar = vi.fn();
  const avisos = { avisar } as unknown as PuertoAvisoDeOutbox;
  let agencias = [T1, T2];
  const outbox = {
    tenantsParaBarrer: vi.fn(() => Promise.resolve(agencias)),
  } as unknown as PuertoOutbox;
  const caso = new RecuperarEnviosSinResolver(outbox, sin, mensajes, cola, avisos);
  return {
    caso,
    sin,
    cola,
    fallos,
    registrarFallo,
    avisar,
    soloAgencias: (a: string[]) => (agencias = a),
  };
}

describe('RecuperarEnviosSinResolver', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('marca «sin confirmar» lo reservado sin wamid y NO lo reencola', async () => {
    const { caso, sin, cola, fallos, avisar } = montar();
    sin.sinConfirmar.set(T1, ['m-1']);
    const r = await caso.barrer();
    expect(r).toEqual({ reencolados: 0, sinConfirmar: 1 });
    expect(cola.encolados).toEqual([]);
    expect(fallos).toEqual([
      { t: T1, m: 'm-1', codigoMeta: null, message: expect.stringMatching(/No pudimos confirmar/) },
    ]);
    expect(avisar).toHaveBeenCalledWith(T1);
  });

  it('reencola los pendientes vencidos, agencia por agencia', async () => {
    const { caso, sin, cola } = montar();
    sin.listos.set(T1, ['m-1']);
    sin.listos.set(T2, ['m-2', 'm-3']);
    const r = await caso.barrer();
    expect(r.reencolados).toBe(3);
    expect(cola.encolados).toEqual([
      [T1, 'm-1'],
      [T2, 'm-2'],
      [T2, 'm-3'],
    ]);
  });

  it('si el mensaje ya se resolvió entre el listado y la marca, no cuenta ni avisa', async () => {
    const { caso, sin, registrarFallo, avisar } = montar();
    sin.sinConfirmar.set(T1, ['m-1']);
    registrarFallo.mockResolvedValueOnce(false);
    expect((await caso.barrer()).sinConfirmar).toBe(0);
    expect(avisar).not.toHaveBeenCalled();
  });

  it('una agencia que falla no impide a las demás, y no se registra el mensaje del error (R10)', async () => {
    const { caso, sin, cola } = montar();
    const error = vi.spyOn(Logger.prototype, 'error');
    vi.spyOn(sin, 'listarSinConfirmar').mockImplementation((t) =>
      t === T1 ? Promise.reject(new Error('Failing row (573001112233)')) : Promise.resolve([]),
    );
    sin.listos.set(T2, ['m-2']);
    await caso.barrer();
    expect(cola.encolados).toEqual([[T2, 'm-2']]);
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/573001112233/);
  });
});
