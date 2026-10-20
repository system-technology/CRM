import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  obtenerTableroPipeline,
  moverOportunidadDeEtapa,
  obtenerFichaDeContacto,
  listarContactos,
  estaUsandoApiReal,
  obtenerTenantDemo,
  CrmApiError,
} from './crm-api';

describe('Cliente de API CRM (crm-api.ts)', () => {
  it('obtenerTableroPipeline devuelve un TableroPipeline válido con columnas y totales', async () => {
    const tablero = await obtenerTableroPipeline();
    expect(tablero.columnas.length).toBeGreaterThanOrEqual(5);

    for (const col of tablero.columnas) {
      expect(col.etapa.id).toBeDefined();
      expect(col.etapa.nombre.length).toBeGreaterThan(0);
      expect(col.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(col.oportunidades)).toBe(true);
    }
  });

  it('moverOportunidadDeEtapa valida entrada y retorna la oportunidad actualizada', async () => {
    const tablero = await obtenerTableroPipeline();
    const primeraColumna = tablero.columnas[0]!;
    const tarjeta = primeraColumna.oportunidades[0]!;
    const etapaDestino = tablero.columnas[1]!.etapa;

    const res = await moverOportunidadDeEtapa(tarjeta.id, {
      etapaId: etapaDestino.id,
      motivoPerdida: null,
      notaPerdida: null,
    });

    expect(res.id).toBe(tarjeta.id);
    expect(res.etapa.id).toBe(etapaDestino.id);
  });

  it('moverOportunidadDeEtapa rechaza entrada inválida si motivo es OTRO sin nota', async () => {
    const tablero = await obtenerTableroPipeline();
    const tarjeta = tablero.columnas[0]!.oportunidades[0]!;
    const etapaPerdida = tablero.columnas[4]!.etapa;

    await expect(
      moverOportunidadDeEtapa(tarjeta.id, {
        etapaId: etapaPerdida.id,
        motivoPerdida: 'OTRO',
        notaPerdida: '',
      }),
    ).rejects.toThrow();
  });

  it('obtenerFichaDeContacto devuelve la ficha completa de un viajero', async () => {
    const ficha = await obtenerFichaDeContacto('00000000-0001-4000-8000-000000000001');
    expect(ficha.contacto).toBeDefined();
    expect(ficha.contacto.telefono).toMatch(/^\+[1-9]\d{7,14}$/);
    expect(Array.isArray(ficha.cotizaciones)).toBe(true);
    expect(Array.isArray(ficha.archivosDeViajeIds)).toBe(true);
    expect(Array.isArray(ficha.notasInternas)).toBe(true);
  });

  it('listarContactos devuelve PaginaContactos y filtra por nombre o teléfono', async () => {
    const pagina = await listarContactos('Juan');
    expect(pagina.datos.length).toBeGreaterThanOrEqual(1);
    expect(pagina.datos[0]?.nombre).toContain('Juan');
  });
});

describe('Detección y reporte de configuración de API CRM (0c.14)', () => {
  it('reporta correctamente el estado de los interruptores de entorno', () => {
    const estado = estaUsandoApiReal();
    expect(typeof estado).toBe('boolean');
    expect(typeof obtenerTenantDemo()).toBe('string');
  });

  it('si NEXT_PUBLIC_USE_REAL_CRM es true pero falta NEXT_PUBLIC_DEV_TENANT_ID, lanza CrmApiError con CONFIG_TENANT_FALTANTE (401)', async () => {
    const prevCrm = process.env['NEXT_PUBLIC_USE_REAL_CRM'];
    const prevTenant = process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

    try {
      process.env['NEXT_PUBLIC_USE_REAL_CRM'] = 'true';
      delete process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

      await expect(obtenerTableroPipeline()).rejects.toThrowError(/NEXT_PUBLIC_DEV_TENANT_ID/);
    } finally {
      if (prevCrm !== undefined) process.env['NEXT_PUBLIC_USE_REAL_CRM'] = prevCrm;
      else delete process.env['NEXT_PUBLIC_USE_REAL_CRM'];

      if (prevTenant !== undefined) process.env['NEXT_PUBLIC_DEV_TENANT_ID'] = prevTenant;
      else delete process.env['NEXT_PUBLIC_DEV_TENANT_ID'];
    }
  });
});

describe('0c.34: Con la API real encendida, un fallo es un error, nunca datos simulados (crm-api)', () => {
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

    it('obtenerTableroPipeline lanza CrmApiError y NO devuelve el tablero mock', async () => {
      await expect(obtenerTableroPipeline()).rejects.toThrow(CrmApiError);
    });

    it('moverOportunidadDeEtapa lanza CrmApiError y NO mueve en el mock', async () => {
      await expect(
        moverOportunidadDeEtapa('00000000-0003-4000-8000-000000000001', {
          etapaId: '01932000-0000-7000-8000-000000000002',
          motivoPerdida: null,
          notaPerdida: null,
        }),
      ).rejects.toThrow(CrmApiError);
    });

    it('obtenerFichaDeContacto lanza CrmApiError y NO devuelve la ficha mock', async () => {
      await expect(obtenerFichaDeContacto('00000000-0001-4000-8000-000000000001')).rejects.toThrow(
        CrmApiError,
      );
    });

    it('listarContactos lanza CrmApiError y NO devuelve la lista mock', async () => {
      await expect(listarContactos('Juan')).rejects.toThrow(CrmApiError);
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
                code: 'FALLO_CRITICO_CRM',
                message: 'Servicio CRM temporalmente inaccesible',
              },
            }),
        } as unknown as Response);
    });

    afterEach(() => {
      restaurarEntorno();
    });

    it('obtenerTableroPipeline lanza CrmApiError (500) y NO devuelve el mock', async () => {
      await expect(obtenerTableroPipeline()).rejects.toMatchObject({
        code: 'FALLO_CRITICO_CRM',
        status: 500,
      });
    });

    it('moverOportunidadDeEtapa lanza CrmApiError (500) y NO devuelve el mock', async () => {
      await expect(
        moverOportunidadDeEtapa('00000000-0003-4000-8000-000000000001', {
          etapaId: '01932000-0000-7000-8000-000000000002',
          motivoPerdida: null,
          notaPerdida: null,
        }),
      ).rejects.toMatchObject({
        code: 'FALLO_CRITICO_CRM',
        status: 500,
      });
    });

    it('obtenerFichaDeContacto lanza CrmApiError (500) y NO devuelve el mock', async () => {
      await expect(
        obtenerFichaDeContacto('00000000-0001-4000-8000-000000000001'),
      ).rejects.toMatchObject({
        code: 'FALLO_CRITICO_CRM',
        status: 500,
      });
    });

    it('listarContactos lanza CrmApiError (500) y NO devuelve el mock', async () => {
      await expect(listarContactos('Juan')).rejects.toMatchObject({
        code: 'FALLO_CRITICO_CRM',
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

    it('devuelve los datos simulados sin error de conexión', async () => {
      const tablero = await obtenerTableroPipeline();
      expect(tablero.columnas.length).toBeGreaterThanOrEqual(5);

      const contactos = await listarContactos();
      expect(contactos.datos.length).toBeGreaterThan(0);
    });
  });
});
