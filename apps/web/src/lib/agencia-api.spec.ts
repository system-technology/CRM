import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarRntApi,
  actualizarZonaHorariaApi,
  obtenerAjustesDeAgencia,
  reiniciarAjustesMock,
} from './agencia-api';

function cuerpoDe(init: RequestInit): string {
  if (typeof init.body !== 'string') throw new Error('El cuerpo de la petición no es texto.');
  return init.body;
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const AJUSTES = {
  nombre: 'Agencia',
  paisIso: 'CO',
  monedaIso: 'COP',
  zonaHoraria: 'America/Bogota',
  rnt: '48213',
  rntVerificado: false,
};

describe('agencia-api — modo demo (RNT)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_USE_REAL_CRM', 'false');
    reiniciarAjustesMock();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('la agencia de la demo ya trae su RNT verificado', async () => {
    expect(await obtenerAjustesDeAgencia()).toMatchObject({ rnt: '48213', rntVerificado: true });
  });

  it('guardar el mismo RNT conserva la verificación; cambiarlo la anula; null lo borra', async () => {
    expect(await actualizarRntApi('48213')).toMatchObject({ rnt: '48213', rntVerificado: true });
    expect(await actualizarRntApi('99999')).toMatchObject({ rnt: '99999', rntVerificado: false });
    // Volver al anterior NO recupera la verificación.
    expect(await actualizarRntApi('48213')).toMatchObject({ rnt: '48213', rntVerificado: false });
    expect(await actualizarRntApi(null)).toMatchObject({ rnt: null, rntVerificado: false });
    expect(await obtenerAjustesDeAgencia()).toMatchObject({ rnt: null, rntVerificado: false });
  });

  it('un RNT que no son dígitos ni se intenta guardar', async () => {
    await expect(actualizarRntApi('ABC')).rejects.toThrow();
    await expect(actualizarRntApi('12345678901')).rejects.toThrow();
    expect(await obtenerAjustesDeAgencia()).toMatchObject({ rnt: '48213' });
  });

  it('cambiar la zona no toca el RNT ni su verificación', async () => {
    const a = await actualizarZonaHorariaApi('America/Lima');
    expect(a).toMatchObject({ zonaHoraria: 'America/Lima', rnt: '48213', rntVerificado: true });
  });
});

describe('agencia-api — modo real (RNT)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_USE_REAL_CRM', 'true');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('PATCH manda solo { rnt } y devuelve los ajustes validados con el contrato', async () => {
    fetchMock.mockResolvedValue(respuesta(AJUSTES));
    const a = await actualizarRntApi('48213');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/agencia/ajustes');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(cuerpoDe(init))).toEqual({ rnt: '48213' });
    expect(a).toMatchObject({ rnt: '48213', rntVerificado: false });
  });

  it('borrar manda { rnt: null }', async () => {
    fetchMock.mockResolvedValue(respuesta({ ...AJUSTES, rnt: null }));
    await actualizarRntApi(null);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(cuerpoDe(init))).toEqual({ rnt: null });
  });

  it('nunca manda la verificación, ni cuando cambia la zona', async () => {
    // Una Response solo se lee una vez: una nueva por llamada.
    fetchMock.mockImplementation(() => Promise.resolve(respuesta(AJUSTES)));
    await actualizarRntApi('48213');
    await actualizarZonaHorariaApi('America/Lima');
    for (const llamada of fetchMock.mock.calls) {
      const cuerpo = cuerpoDe(llamada[1] as RequestInit);
      expect(cuerpo).not.toMatch(/rntVerificado|verificado/i);
    }
    const zona = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(cuerpoDe(zona))).toEqual({ zonaHoraria: 'America/Lima' });
  });

  it('lee una respuesta anterior a T-261, sin los campos del RNT', async () => {
    const { rnt: _r, rntVerificado: _v, ...vieja } = AJUSTES;
    fetchMock.mockResolvedValue(respuesta(vieja));
    const a = await obtenerAjustesDeAgencia();
    expect(a.rnt).toBeUndefined();
    expect(a.rntVerificado).toBeUndefined();
  });

  it('403 llega como error tipado con el estado', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ error: { code: 'PERMISO_DENEGADO', message: 'No' } }, 403),
    );
    await expect(actualizarRntApi('48213')).rejects.toMatchObject({ estado: 403 });
  });
});
