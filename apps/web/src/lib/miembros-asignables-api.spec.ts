import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorMiembrosAsignablesApi, listarMiembrosAsignablesApi } from './miembros-asignables-api';

const ID = '01932000-0000-7000-8000-0000000000b1';

function responder(status: number, cuerpo: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(cuerpo),
  });
}

describe('listarMiembrosAsignablesApi (ADR-0022)', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_USE_REAL_INBOX', 'true');
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('en modo real pide la ruta con cookies y devuelve la lista validada', async () => {
    responder(200, [{ id: ID, nombre: 'Ana' }]);
    await expect(listarMiembrosAsignablesApi()).resolves.toEqual([{ id: ID, nombre: 'Ana' }]);
    const llamada = vi.mocked(globalThis.fetch).mock.calls[0];
    const url = typeof llamada?.[0] === 'string' ? llamada[0] : '';
    const init = llamada?.[1];
    expect(url).toContain('/api/v1/identidad/miembros/asignables');
    expect(init?.credentials).toBe('include');
  });

  it('rechaza una respuesta con campos de más (correo): el contrato es estricto', async () => {
    responder(200, [{ id: ID, nombre: 'Ana', correo: 'ana@x.test' }]);
    await expect(listarMiembrosAsignablesApi()).rejects.toMatchObject({
      codigo: 'RESPUESTA_INVALIDA',
    });
  });

  it('403 se traduce a PERMISO_DENEGADO', async () => {
    responder(403, {});
    await expect(listarMiembrosAsignablesApi()).rejects.toBeInstanceOf(ErrorMiembrosAsignablesApi);
    await expect(listarMiembrosAsignablesApi()).rejects.toMatchObject({
      codigo: 'PERMISO_DENEGADO',
      estado: 403,
    });
  });

  it('en modo maqueta devuelve el mock sin llamar a la red', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_INBOX', 'true');
    globalThis.fetch = vi.fn();
    const r = await listarMiembrosAsignablesApi();
    expect(r.length).toBeGreaterThan(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
