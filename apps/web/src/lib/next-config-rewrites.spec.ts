import { describe, expect, it } from 'vitest';
import { RUTA_SOCKET_BANDEJA } from '@viajapro/contracts';
import config from '../../next.config.mjs';

type Regla = { source: string; destination: string };

async function reglas(entorno: Record<string, string | undefined>): Promise<Regla[]> {
  const previo = { ...process.env };
  Object.assign(process.env, entorno);
  for (const [k, v] of Object.entries(entorno)) if (v === undefined) delete process.env[k];
  try {
    const r = await (config as unknown as { rewrites: () => Promise<Regla[]> }).rewrites();
    return r;
  } finally {
    process.env = previo;
  }
}

describe('next.config.mjs: rewrites hacia la API', () => {
  it('reenvia la API y repone la barra final del socket, antes de la regla general', async () => {
    const r = await reglas({ API_INTERNAL_URL: 'https://api.ejemplo.test' });
    expect(r[0]).toEqual({
      source: RUTA_SOCKET_BANDEJA,
      destination: `https://api.ejemplo.test${RUTA_SOCKET_BANDEJA}/`,
    });
    expect(r[1]).toEqual({
      source: '/api/v1/:path*',
      destination: 'https://api.ejemplo.test/api/v1/:path*',
    });
  });

  it('sin variables apunta al API local', async () => {
    const r = await reglas({ API_INTERNAL_URL: undefined, NEXT_PUBLIC_API_URL: undefined });
    expect(r[1]?.destination).toBe('http://localhost:3333/api/v1/:path*');
  });
});
