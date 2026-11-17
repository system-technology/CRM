import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListaDeNotificaciones } from '@viajapro/contracts';
import {
  AvisosApiError,
  crearAvisosDemo,
  listarAvisos,
  marcarAvisoLeido,
  reiniciarAvisosDemo,
} from './avisos-plazo-api';
import { adaptarAvisoANotificacionWeb, esAvisoDePlazo, idDeAviso } from './avisos-plazo-logica';
import { aplicarLecturaLocal } from './use-avisos-de-plazo';

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('avisos de plazo — lógica de presentación', () => {
  const ahora = Date.parse('2026-10-03T12:00:00Z');
  const base = crearAvisosDemo(ahora)[0]!;

  it('compone el texto con el número de file y el plazo en la zona de la agencia (R9)', () => {
    const n = { ...base, venceEn: '2026-10-03T15:00:00.000Z' };
    const bogota = adaptarAvisoANotificacionWeb(n, 'America/Bogota', ahora);
    const madrid = adaptarAvisoANotificacionWeb(n, 'Europe/Madrid', ahora);
    expect(bogota.detalle).toContain('file 1043');
    expect(bogota.detalle).toContain('vence en 3 horas');
    expect(bogota.detalle).toMatch(/10:00/);
    expect(madrid.detalle).toMatch(/5:00/);
  });

  it('enlaza a Reservas por archivoId y distingue vencido de próximo', () => {
    const w = adaptarAvisoANotificacionWeb(
      { ...base, tipo: 'PAGO_TOTAL_VENCIDO' },
      'America/Bogota',
      ahora,
    );
    expect(w.href).toBe(`/viajes?id=${base.archivoId}`);
    expect(w.severidad).toBe('critica');
    expect(w.titulo).toBe('Pago total vencido');
    expect(w.leida).toBe(false);
    expect(esAvisoDePlazo(w.id)).toBe(true);
    expect(idDeAviso(w.id)).toBe(base.id);
  });

  it('aplicarLecturaLocal baja el contador una sola vez (idempotente)', () => {
    const lista = { datos: crearAvisosDemo(ahora), noLeidas: 2 };
    const una = aplicarLecturaLocal(lista, base.id, '2026-10-03T12:01:00.000Z');
    expect(una.noLeidas).toBe(1);
    expect(una.datos[0]!.leidaEn).toBe('2026-10-03T12:01:00.000Z');
    expect(aplicarLecturaLocal(una, base.id, '2026-10-03T12:05:00.000Z')).toBe(una);
  });
});

describe('avisos de plazo — demo', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_USE_REAL_CRM', 'false');
    reiniciarAvisosDemo();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('devuelve datos con la forma del contrato y marcar leída es solo local', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const lista = await listarAvisos();
    expect(ListaDeNotificaciones.safeParse(lista).success).toBe(true);
    expect(lista.noLeidas).toBe(2);
    await marcarAvisoLeido(lista.datos[0]!.id);
    const despues = await listarAvisos();
    expect(despues.noLeidas).toBe(1);
    expect(despues.datos.at(-1)!.leidaEn).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('avisos de plazo — modo real', () => {
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

  it('lista validando con el contrato y pide el límite', async () => {
    fetchMock.mockResolvedValue(respuesta({ datos: crearAvisosDemo(), noLeidas: 7 }));
    const lista = await listarAvisos(20);
    expect(lista.noLeidas).toBe(7);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/notificaciones?limite=20');
  });

  it('rechaza una respuesta que no cumple el contrato', async () => {
    fetchMock.mockResolvedValue(respuesta({ datos: [{ id: 'x' }], noLeidas: 1 }));
    await expect(listarAvisos()).rejects.toMatchObject({ code: 'RESPUESTA_INVALIDA' });
  });

  it('marca leída con POST a /lectura', async () => {
    fetchMock.mockResolvedValue(respuesta({}));
    await marcarAvisoLeido('abc');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/notificaciones/abc/lectura');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
  });

  it('un 404 lleva el código de la API', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ error: { code: 'NOTIFICACION_NO_ENCONTRADA', message: 'No existe.' } }, 404),
    );
    await expect(marcarAvisoLeido('ajena')).rejects.toBeInstanceOf(AvisosApiError);
  });

  it('un fallo de red es ERROR_CONEXION', async () => {
    fetchMock.mockRejectedValue(new TypeError('red'));
    await expect(listarAvisos()).rejects.toMatchObject({ code: 'ERROR_CONEXION' });
  });
});
