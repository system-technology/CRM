import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  anadirVersionCotizacionApi,
  CotizacionesApiError,
  guardarCotizacionApi,
  obtenerCotizacionGuardadaApi,
  listarCotizacionesApi,
} from './cotizaciones-api';

describe('cotizaciones-api (0c.22 & 0c.28)', () => {
  const CONTACTO_ID = '00000000-0002-4000-8000-000000000001';
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';

  it('guarda una cotización mock con versión 1 y la recupera', async () => {
    const creada = await guardarCotizacionApi({
      contactoId: CONTACTO_ID,
      titulo: 'Cotización San Andrés Test',
      version: {
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-25',
        adultos: 2,
        acomodacion: 'DOBLE',
      },
    });

    expect(creada.id).toBeDefined();
    expect(creada.versiones.length).toBe(1);
    expect(creada.versiones[0]!.numero).toBe(1);
    expect(creada.versiones[0]!.venta.unidades).toBeDefined();

    // Recuperar
    const obtenida = await obtenerCotizacionGuardadaApi(creada.id);
    expect(obtenida.id).toBe(creada.id);
    expect(obtenida.versiones.length).toBe(1);
  });

  it('añade versión 2 a una cotización existente preservando versión 1 inmutable', async () => {
    const creada = await guardarCotizacionApi({
      contactoId: CONTACTO_ID,
      titulo: 'Cotización Versionable',
      version: {
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-25',
        adultos: 2,
        acomodacion: 'DOBLE',
      },
    });

    const v1Original = creada.versiones[0]!;

    // Añadir versión 2 con 3 adultos
    const conV2 = await anadirVersionCotizacionApi(creada.id, {
      paqueteId: PAQUETE_ID,
      fecha: '2026-10-25',
      adultos: 3,
      acomodacion: 'TRIPLE',
    });

    expect(conV2.versiones.length).toBe(2);
    expect(conV2.versiones[0]!.numero).toBe(1);
    expect(conV2.versiones[1]!.numero).toBe(2);

    // Invariante de producto: la versión 1 no mutó
    expect(conV2.versiones[0]!.adultos).toBe(v1Original.adultos);
    expect(conV2.versiones[0]!.acomodacion).toBe(v1Original.acomodacion);
    expect(conV2.versiones[0]!.venta).toEqual(v1Original.venta);

    // La versión 2 tiene sus propios datos
    expect(conV2.versiones[1]!.adultos).toBe(3);
    expect(conV2.versiones[1]!.acomodacion).toBe('TRIPLE');
  });

  it('lanza 404 honesto si la cotización no existe', async () => {
    await expect(
      obtenerCotizacionGuardadaApi('00000000-0000-0000-0000-999999999999'),
    ).rejects.toThrow(CotizacionesApiError);
  });

  it('lista las cotizaciones guardadas con paginación por cursor (0c.28)', async () => {
    const respuesta = await listarCotizacionesApi({ limite: 10 });
    expect(respuesta.datos).toBeDefined();
    expect(Array.isArray(respuesta.datos)).toBe(true);
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(respuesta.pageInfo).toBeDefined();
    expect(typeof respuesta.pageInfo.hasMore).toBe('boolean');

    const primera = respuesta.datos[0]!;
    expect(primera.id).toBeDefined();
    expect(primera.numeroDeVersiones).toBeGreaterThanOrEqual(1);
    expect(primera.venta.unidades).toBeDefined();
    expect(primera.venta.moneda).toBe('COP');
    // R10: Sin margen ni política
    expect(primera).not.toHaveProperty('politica');
  });
});

describe('0c.34: Con la API real encendida, un fallo es un error, nunca datos simulados (cotizaciones-api)', () => {
  const CONTACTO_ID = '00000000-0002-4000-8000-000000000001';
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';
  const originalFetch = globalThis.fetch;
  const originalCrmEnv = process.env['NEXT_PUBLIC_USE_REAL_CRM'];
  const originalTenantEnv = process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

  function activarApiReal() {
    process.env['NEXT_PUBLIC_USE_REAL_CRM'] = 'true';
    process.env['NEXT_PUBLIC_DEV_TENANT_ID'] = '01932000-0000-7000-8000-00000000000a';
  }

  function restaurarEntorno() {
    globalThis.fetch = originalFetch;
    if (originalCrmEnv !== undefined) {
      process.env['NEXT_PUBLIC_USE_REAL_CRM'] = originalCrmEnv;
    } else {
      delete process.env['NEXT_PUBLIC_USE_REAL_CRM'];
    }
    if (originalTenantEnv !== undefined) {
      process.env['NEXT_PUBLIC_DEV_TENANT_ID'] = originalTenantEnv;
    } else {
      delete process.env['NEXT_PUBLIC_DEV_TENANT_ID'];
    }
  }

  describe('Con fetch rechazado (fallo de red/conexión)', () => {
    beforeEach(() => {
      activarApiReal();
      globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    });

    afterEach(() => {
      restaurarEntorno();
    });

    it('guardarCotizacionApi lanza error y NO devuelve datos del mock', async () => {
      await expect(
        guardarCotizacionApi({
          contactoId: CONTACTO_ID,
          titulo: 'Cotización Test Fallo Red',
          version: {
            paqueteId: PAQUETE_ID,
            fecha: '2026-10-25',
            adultos: 2,
            acomodacion: 'DOBLE',
          },
        }),
      ).rejects.toThrow(CotizacionesApiError);
    });

    it('anadirVersionCotizacionApi lanza error y NO devuelve datos del mock', async () => {
      await expect(
        anadirVersionCotizacionApi('01932000-0000-7000-8000-000000000001', {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-25',
          adultos: 2,
          acomodacion: 'DOBLE',
        }),
      ).rejects.toThrow(CotizacionesApiError);
    });

    it('obtenerCotizacionGuardadaApi lanza error y NO devuelve datos del mock', async () => {
      await expect(
        obtenerCotizacionGuardadaApi('01932000-0000-7000-8000-000000000001'),
      ).rejects.toThrow(CotizacionesApiError);
    });

    it('listarCotizacionesApi lanza error y NO devuelve datos del mock', async () => {
      await expect(listarCotizacionesApi({ limite: 5 })).rejects.toThrow(CotizacionesApiError);
    });
  });

  describe('Con respuesta 500 del servidor', () => {
    beforeEach(() => {
      activarApiReal();
      globalThis.fetch = () =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () =>
            Promise.resolve({
              error: {
                code: 'ERROR_INTERNO_SERVIDOR',
                message: 'Fallo crítico en base de datos',
              },
            }),
        } as unknown as Response);
    });

    afterEach(() => {
      restaurarEntorno();
    });

    it('guardarCotizacionApi lanza CotizacionesApiError (500) y NO devuelve datos mock', async () => {
      await expect(
        guardarCotizacionApi({
          contactoId: CONTACTO_ID,
          titulo: 'Cotización 500',
          version: {
            paqueteId: PAQUETE_ID,
            fecha: '2026-10-25',
            adultos: 2,
            acomodacion: 'DOBLE',
          },
        }),
      ).rejects.toMatchObject({
        code: 'ERROR_INTERNO_SERVIDOR',
        status: 500,
      });
    });

    it('anadirVersionCotizacionApi lanza CotizacionesApiError (500) y NO devuelve datos mock', async () => {
      await expect(
        anadirVersionCotizacionApi('01932000-0000-7000-8000-000000000001', {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-25',
          adultos: 2,
          acomodacion: 'DOBLE',
        }),
      ).rejects.toMatchObject({
        code: 'ERROR_INTERNO_SERVIDOR',
        status: 500,
      });
    });

    it('obtenerCotizacionGuardadaApi lanza CotizacionesApiError (500) y NO devuelve datos mock', async () => {
      await expect(
        obtenerCotizacionGuardadaApi('01932000-0000-7000-8000-000000000001'),
      ).rejects.toMatchObject({
        code: 'ERROR_INTERNO_SERVIDOR',
        status: 500,
      });
    });

    it('listarCotizacionesApi lanza CotizacionesApiError (500) y NO devuelve datos mock', async () => {
      await expect(listarCotizacionesApi({ limite: 5 })).rejects.toMatchObject({
        code: 'ERROR_INTERNO_SERVIDOR',
        status: 500,
      });
    });
  });

  describe('Con interruptor apagado (modo mock offline)', () => {
    beforeEach(() => {
      process.env['NEXT_PUBLIC_USE_REAL_CRM'] = 'false';
    });

    afterEach(() => {
      restaurarEntorno();
    });

    it('devuelve los datos simulados sin lanzar error de conexión', async () => {
      const lista = await listarCotizacionesApi({ limite: 2 });
      expect(lista.datos.length).toBeGreaterThan(0);
      expect(lista.pageInfo).toBeDefined();

      const obtenida = await obtenerCotizacionGuardadaApi(lista.datos[0]!.id);
      expect(obtenida.id).toBe(lista.datos[0]!.id);
    });
  });
});
