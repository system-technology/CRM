import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cabecerasDeTenantDev } from './cabeceras-tenant';
import { obtenerTableroPipeline, CrmApiError } from './crm-api';

describe('cabecerasDeTenantDev (0c.39 - Frontera de sesión ADR-0011)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('con autenticación real activa, NUNCA envía x-dev-tenant-id aunque NEXT_PUBLIC_DEV_TENANT_ID exista', () => {
    process.env['NEXT_PUBLIC_USE_REAL_AUTH'] = 'true';
    process.env['NEXT_PUBLIC_DEV_TENANT_ID'] = '01932000-0000-7000-8000-00000000000a';

    const headers = cabecerasDeTenantDev();
    expect(headers).toEqual({});
  });

  it('con autenticación real activa, obtenerTableroPipeline NO exige NEXT_PUBLIC_DEV_TENANT_ID ni lanza CONFIG_TENANT_FALTANTE', async () => {
    process.env['NEXT_PUBLIC_USE_REAL_AUTH'] = 'true';
    process.env['NEXT_PUBLIC_USE_REAL_CRM'] = 'true';
    delete process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

    const mockTablero = {
      columnas: [],
      totalesPorEtapa: {},
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTablero),
    });
    global.fetch = fetchMock;

    await expect(obtenerTableroPipeline()).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/crm/tablero'),
      expect.objectContaining({
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('con autenticación apagada, envía x-dev-tenant-id si NEXT_PUBLIC_DEV_TENANT_ID está configurada', () => {
    delete process.env['NEXT_PUBLIC_USE_REAL_AUTH'];
    process.env['NEXT_PUBLIC_DEV_TENANT_ID'] = '01932000-0000-7000-8000-00000000000a';

    const headers = cabecerasDeTenantDev();
    expect(headers).toEqual({
      'x-dev-tenant-id': '01932000-0000-7000-8000-00000000000a',
    });
  });

  it('con autenticación apagada, devuelve {} si NEXT_PUBLIC_DEV_TENANT_ID está vacía o indefinida', () => {
    delete process.env['NEXT_PUBLIC_USE_REAL_AUTH'];
    delete process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

    const headers = cabecerasDeTenantDev();
    expect(headers).toEqual({});
  });

  it('con autenticación apagada y CRM real activo, exige NEXT_PUBLIC_DEV_TENANT_ID y lanza CONFIG_TENANT_FALTANTE', async () => {
    delete process.env['NEXT_PUBLIC_USE_REAL_AUTH'];
    process.env['NEXT_PUBLIC_USE_REAL_CRM'] = 'true';
    delete process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

    try {
      await obtenerTableroPipeline();
      expect.unreachable('Debería haber lanzado error');
    } catch (err) {
      expect(err).toBeInstanceOf(CrmApiError);
      expect((err as CrmApiError).code).toBe('CONFIG_TENANT_FALTANTE');
      expect((err as CrmApiError).message).toContain('NEXT_PUBLIC_DEV_TENANT_ID');
    }
  });
});
