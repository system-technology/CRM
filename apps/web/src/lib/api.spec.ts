import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ErrorApi } from './api';

describe('Cliente API (T-008)', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('1. api.listarPaquetes consulta /api/v1/paquetes y no la ruta antigua retirada', async () => {
    const mockRespuesta = {
      datos: [
        {
          id: '01932000-0000-7000-8000-000000000001',
          nombre: 'Eje Cafetero Mágico',
          slug: 'eje-cafetero-magico',
          destino: 'Eje Cafetero',
          descripcion: 'Recorrido por fincas cafeteras',
          duracionDias: 4,
          duracionNoches: 3,
          activo: true,
          destacado: true,
          imagenes: [],
          incluye: [],
          noIncluye: [],
          itinerario: [],
          creadoEn: '2026-10-26T00:00:00Z',
          actualizadoEn: '2026-10-26T00:00:00Z',
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRespuesta),
    });
    global.fetch = mockFetch;

    const resultado = await api.listarPaquetes();
    expect(resultado.datos).toHaveLength(1);
    expect(resultado.datos[0]!.nombre).toBe('Eje Cafetero Mágico');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const rutaInvocada = mockFetch.mock.calls[0]![0] as string;
    expect(rutaInvocada).toContain('/api/v1/paquetes');
    expect(rutaInvocada).not.toContain('/api/v1/paquetes/cotizar');
  });

  it('2. Lanza ErrorApi tipado cuando la API responde un sobre de error contractual', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          error: {
            code: 'PAQUETE_NO_ENCONTRADO',
            message: 'El paquete solicitado no existe en la base de datos.',
            details: { id: '01932000-0000-7000-8000-000000000999' },
          },
        }),
    });

    await expect(api.listarPaquetes()).rejects.toThrow(ErrorApi);
    try {
      await api.listarPaquetes();
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorApi);
      const errorApi = err as ErrorApi;
      expect(errorApi.code).toBe('PAQUETE_NO_ENCONTRADO');
      expect(errorApi.message).toBe('El paquete solicitado no existe en la base de datos.');
      expect(errorApi.details).toEqual({ id: '01932000-0000-7000-8000-000000000999' });
    }
  });

  it('3. Lanza RESPUESTA_NO_RECONOCIDA si la respuesta no coincide con el contrato de error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ html: '<html>Bad Gateway</html>' }),
    });

    try {
      await api.listarPaquetes();
      expect.unreachable('Debería haber lanzado un ErrorApi');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorApi);
      const errorApi = err as ErrorApi;
      expect(errorApi.code).toBe('RESPUESTA_NO_RECONOCIDA');
      expect(errorApi.message).toContain('502');
    }
  });

  it('4. api.cotizarSalida delega a la ruta vigente /api/v1/catalogo/cotizar y no a /api/v1/paquetes/cotizar', async () => {
    const mockCotizacion = {
      paqueteId: '01932000-0000-7000-8000-000000000001',
      paqueteNombre: 'Eje Cafetero Mágico',
      destino: 'Eje Cafetero',
      noches: 3,
      fecha: '2026-11-15',
      vigenciaId: '01932000-0000-7000-8000-000000000002',
      vigenciaDesde: '2026-11-01',
      vigenciaHasta: '2026-11-30',
      deSalidaProgramada: false,
      adultos: 2,
      ninos: 0,
      infantes: 0,
      pasajeros: 2,
      lineas: [
        {
          tarifaId: '01932000-0000-7000-8000-000000000003',
          nombre: 'Tarifa Adulto General',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 2,
          precioUnitario: { unidades: '1200000', moneda: 'COP' },
          total: { unidades: '2400000', moneda: 'COP' },
          masBarata: true,
        },
      ],
      total: { unidades: '2400000', moneda: 'COP' },
      alternativas: [],
      noAplicables: [],
      suplementos: [],
      pideComposicion: false,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCotizacion),
    });
    global.fetch = mockFetch;

    const resultado = await api.cotizarSalida({
      paqueteId: '01932000-0000-7000-8000-000000000001',
      fecha: '2026-11-15',
      adultos: 2,
    });

    expect(resultado.total.unidades).toBe('2400000');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const rutaInvocada = mockFetch.mock.calls[0]![0] as string;
    expect(rutaInvocada).toContain('/api/v1/catalogo/cotizar');
    expect(rutaInvocada).not.toContain('/api/v1/paquetes/cotizar');
  });
});
