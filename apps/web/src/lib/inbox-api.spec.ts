import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { inboxApi, InboxErrorApi } from './inbox-api';

describe('0c.34: Con la API real encendida, un fallo es un error, nunca datos simulados (inbox-api)', () => {
  const originalFetch = globalThis.fetch;
  const originalInboxEnv = process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
  const originalTenantEnv = process.env['NEXT_PUBLIC_DEV_TENANT_ID'];

  function activarApiReal() {
    process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = 'true';
    process.env['NEXT_PUBLIC_DEV_TENANT_ID'] = '01932000-0000-7000-8000-00000000000a';
  }

  function restaurarEntorno() {
    globalThis.fetch = originalFetch;
    if (originalInboxEnv !== undefined) {
      process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = originalInboxEnv;
    } else {
      delete process.env['NEXT_PUBLIC_USE_REAL_INBOX'];
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

    it('consultarBandeja lanza InboxErrorApi y NO devuelve mock', async () => {
      await expect(inboxApi.consultarBandeja({ limite: 15, filtro: 'TODAS' })).rejects.toThrow(
        InboxErrorApi,
      );
    });

    it('obtenerConversacionDetalle lanza InboxErrorApi y NO devuelve mock', async () => {
      await expect(
        inboxApi.obtenerConversacionDetalle('01932000-0000-7000-8000-000000000001'),
      ).rejects.toThrow(InboxErrorApi);
    });

    it('enviarTexto lanza InboxErrorApi y NO devuelve mock', async () => {
      await expect(
        inboxApi.enviarTexto({
          conversacionId: '01932000-0000-7000-8000-000000000001',
          texto: 'Hola',
          claveIdempotencia: '01932000-0000-7000-8000-000000000002',
        }),
      ).rejects.toThrow(InboxErrorApi);
    });

    it('asignarConversacion lanza InboxErrorApi y NO devuelve mock', async () => {
      await expect(
        inboxApi.asignarConversacion({
          conversacionId: '01932000-0000-7000-8000-000000000001',
          usuarioId: '01932000-0000-7000-8000-000000000003',
        }),
      ).rejects.toThrow(InboxErrorApi);
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
                code: 'ERROR_INTERNO_INBOX',
                message: 'Fallo crítico en servicio de mensajería',
              },
            }),
        } as unknown as Response);
    });

    afterEach(() => {
      restaurarEntorno();
    });

    it('consultarBandeja lanza InboxErrorApi con código del servidor y NO devuelve mock', async () => {
      await expect(
        inboxApi.consultarBandeja({ limite: 15, filtro: 'TODAS' }),
      ).rejects.toMatchObject({
        code: 'ERROR_INTERNO_INBOX',
      });
    });

    it('obtenerConversacionDetalle lanza InboxErrorApi y NO devuelve mock', async () => {
      await expect(
        inboxApi.obtenerConversacionDetalle('01932000-0000-7000-8000-000000000001'),
      ).rejects.toMatchObject({
        code: 'ERROR_INTERNO_INBOX',
      });
    });

    it('enviarTexto lanza InboxErrorApi y NO devuelve mock', async () => {
      await expect(
        inboxApi.enviarTexto({
          conversacionId: '01932000-0000-7000-8000-000000000001',
          texto: 'Hola',
          claveIdempotencia: '01932000-0000-7000-8000-000000000002',
        }),
      ).rejects.toMatchObject({
        code: 'ERROR_INTERNO_INBOX',
      });
    });
  });

  describe('Con interruptor apagado (modo mock offline)', () => {
    beforeEach(() => {
      process.env['NEXT_PUBLIC_USE_REAL_INBOX'] = 'false';
    });

    afterEach(() => {
      restaurarEntorno();
    });

    it('devuelve los datos simulados sin lanzar error de conexión', async () => {
      const pagina = await inboxApi.consultarBandeja({ limite: 15, filtro: 'TODAS' });
      expect(pagina.datos.length).toBeGreaterThan(0);
      expect(pagina.pageInfo).toBeDefined();

      const detalle = await inboxApi.obtenerConversacionDetalle(pagina.datos[0]!.id);
      expect(detalle).toBeDefined();
      expect(detalle?.id).toBe(pagina.datos[0]!.id);
    });
  });
});
