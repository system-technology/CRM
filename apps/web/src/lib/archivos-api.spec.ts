import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArchivosApiError,
  actualizarReserva,
  listarArchivos,
  obtenerArchivo,
  reemplazarPasajeros,
} from './archivos-api';
import { MOCK_DETALLES_ARCHIVOS } from './mock-archivos';

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('archivos-api — modo real', () => {
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

  it('lista los archivos y tolera reservas sin netoUnidades (sin permiso de neto)', async () => {
    fetchMock.mockResolvedValue(respuesta({ datos: MOCK_DETALLES_ARCHIVOS }));
    const datos = await listarArchivos('ABIERTO');
    expect(datos).toHaveLength(2);
    expect(datos[0]!.reservas[0]!.netoUnidades).toBeUndefined();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/archivos?estado=ABIERTO');
  });

  it('acepta netoUnidades presente y null (neto desconocido)', async () => {
    const con = structuredClone(MOCK_DETALLES_ARCHIVOS[0]!);
    con.reservas[0]!.netoUnidades = '3500000';
    con.reservas[1]!.netoUnidades = null;
    fetchMock.mockResolvedValue(respuesta(con));
    const d = await obtenerArchivo(con.id);
    expect(d.reservas[0]!.netoUnidades).toBe('3500000');
    expect(d.reservas[1]!.netoUnidades).toBeNull();
  });

  it('PUT de reserva manda el cuerpo validado y devuelve el archivo actualizado', async () => {
    const a = MOCK_DETALLES_ARCHIVOS[0]!;
    fetchMock.mockResolvedValue(respuesta(a));
    await actualizarReserva(a.id, a.reservas[0]!.id, {
      estado: 'CONFIRMADA',
      timeLimit: '2026-12-01T23:30:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(String(url)).toContain(`/api/v1/archivos/${a.id}/reservas/${a.reservas[0]!.id}`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      estado: 'CONFIRMADA',
      timeLimit: '2026-12-01T23:30:00.000Z',
    });
  });

  it('un 422 del dominio llega como ArchivosApiError con su código y estado', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ error: { code: 'TITULAR_INVALIDO', message: 'x', details: {} } }, 422),
    );
    const llamada = reemplazarPasajeros(MOCK_DETALLES_ARCHIVOS[0]!.id, { pasajeros: [] });
    await expect(llamada).rejects.toMatchObject({ code: 'TITULAR_INVALIDO', status: 422 });
    await expect(llamada).rejects.toBeInstanceOf(ArchivosApiError);
  });

  it('un fallo de red es ERROR_CONEXION', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(listarArchivos()).rejects.toMatchObject({ code: 'ERROR_CONEXION' });
  });
});

describe('archivos-api — modo demostración', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_USE_REAL_CRM', 'false'));
  afterEach(() => vi.unstubAllEnvs());

  it('lee de la maqueta y rechaza las mutaciones con MODO_DEMO', async () => {
    expect(await listarArchivos('ABIERTO')).toHaveLength(2);
    const a = MOCK_DETALLES_ARCHIVOS[0]!;
    expect((await obtenerArchivo(a.id)).numero).toBe(1043);
    await expect(
      actualizarReserva(a.id, a.reservas[0]!.id, { estado: 'CAIDA', motivoCaida: 'SIN_CUPO' }),
    ).rejects.toMatchObject({
      code: 'MODO_DEMO',
    });
  });
});
