import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ContextoTenant } from '../../tenant/contexto-tenant.js';
import {
  AlmacenDeContadoresEnMemoria,
  AlmacenDeContadoresRedis,
  type ClienteRedisDeLimite,
} from './almacen.js';
import {
  LimiteDeTasaPorIpMiddleware,
  LimiteDeTasaPorTenantMiddleware,
} from './limite-de-tasa.middleware.js';
import { leerPoliticaDeLimiteDeTasa, type PoliticaDeLimiteDeTasa } from './politica.js';

const politica = (extra: Partial<PoliticaDeLimiteDeTasa> = {}): PoliticaDeLimiteDeTasa => ({
  activo: true,
  porTenant: 3,
  porIp: 3,
  ventanaSegundos: 60,
  almacen: 'memoria',
  ...extra,
});

function llamar(
  mw: { use(req: Request, res: Response, next: NextFunction): Promise<void> },
  ruta: string,
  ip = '1.1.1.1',
) {
  const cabeceras: Record<string, string> = {};
  let estado = 200;
  let paso = false;
  const res = {
    setHeader: (k: string, v: string) => (cabeceras[k] = v),
    status: (s: number) => {
      estado = s;
      return res;
    },
    json: () => res,
  } as unknown as Response;
  const req = {
    method: 'GET',
    originalUrl: ruta,
    url: ruta,
    ip,
    headers: {},
  } as unknown as Request;
  return mw
    .use(req, res, (() => (paso = true)) as NextFunction)
    .then(() => ({ estado, cabeceras, paso }));
}

const contexto = (tenantId: string) => ({
  tenantId,
  usuarioId: null,
  identidadId: null,
  permisos: new Set<never>(),
  trazaId: 't',
});

describe('límite de tasa por IP', () => {
  it('supera el umbral: 429 con Retry-After; recupera tras la ventana', async () => {
    let ahora = 1_000_000;
    const almacen = new AlmacenDeContadoresEnMemoria(() => ahora);
    const mw = new LimiteDeTasaPorIpMiddleware(politica(), almacen);
    for (let i = 0; i < 3; i++) expect((await llamar(mw, '/api/v1/clientes')).paso).toBe(true);
    const r = await llamar(mw, '/api/v1/clientes');
    expect(r.estado).toBe(429);
    expect(r.paso).toBe(false);
    expect(Number(r.cabeceras['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(Number(r.cabeceras['Retry-After'])).toBeLessThanOrEqual(60);
    ahora += 61_000;
    expect((await llamar(mw, '/api/v1/clientes')).paso).toBe(true);
  });

  it('IP distinta no se ve afectada', async () => {
    const mw = new LimiteDeTasaPorIpMiddleware(politica(), new AlmacenDeContadoresEnMemoria());
    for (let i = 0; i < 5; i++) await llamar(mw, '/api/v1/x', '1.1.1.1');
    expect((await llamar(mw, '/api/v1/x', '2.2.2.2')).paso).toBe(true);
  });

  it('webhooks y salud están exentos', async () => {
    const mw = new LimiteDeTasaPorIpMiddleware(
      politica({ porIp: 1 }),
      new AlmacenDeContadoresEnMemoria(),
    );
    for (let i = 0; i < 5; i++) {
      expect((await llamar(mw, '/webhooks/whatsapp')).paso).toBe(true);
      expect((await llamar(mw, '/salud')).paso).toBe(true);
    }
  });

  it('apagado explícito: no limita', async () => {
    const mw = new LimiteDeTasaPorIpMiddleware(
      politica({ activo: false, porIp: 1 }),
      new AlmacenDeContadoresEnMemoria(),
    );
    for (let i = 0; i < 4; i++) expect((await llamar(mw, '/api/v1/x')).paso).toBe(true);
  });

  it('si el almacén falla, deja pasar', async () => {
    const almacen = { consumir: () => Promise.reject(new Error('redis caído')) };
    const mw = new LimiteDeTasaPorIpMiddleware(politica(), almacen);
    expect((await llamar(mw, '/api/v1/x')).paso).toBe(true);
  });
});

describe('límite de tasa por tenant', () => {
  it('una agencia agotada no afecta a otra', async () => {
    const mw = new LimiteDeTasaPorTenantMiddleware(politica(), new AlmacenDeContadoresEnMemoria());
    const como = (t: string) =>
      ContextoTenant.ejecutarCon(contexto(t), () => llamar(mw, '/api/v1/clientes'));
    for (let i = 0; i < 3; i++) await como('agencia-a');
    expect((await como('agencia-a')).estado).toBe(429);
    expect((await como('agencia-b')).paso).toBe(true);
  });

  it('el tenant cuenta aunque cambie la IP', async () => {
    const mw = new LimiteDeTasaPorTenantMiddleware(politica(), new AlmacenDeContadoresEnMemoria());
    for (let i = 0; i < 3; i++)
      await ContextoTenant.ejecutarCon(contexto('a'), () => llamar(mw, '/x', `9.9.9.${i}`));
    const r = await ContextoTenant.ejecutarCon(contexto('a'), () => llamar(mw, '/x', '8.8.8.8'));
    expect(r.estado).toBe(429);
  });

  it('sin contexto de tenant (rutas de auth) no cuenta', async () => {
    const mw = new LimiteDeTasaPorTenantMiddleware(
      politica({ porTenant: 1 }),
      new AlmacenDeContadoresEnMemoria(),
    );
    for (let i = 0; i < 3; i++) expect((await llamar(mw, '/api/v1/auth/session')).paso).toBe(true);
  });

  it('webhooks exentos aunque haya contexto', async () => {
    const mw = new LimiteDeTasaPorTenantMiddleware(
      politica({ porTenant: 1 }),
      new AlmacenDeContadoresEnMemoria(),
    );
    for (let i = 0; i < 3; i++) {
      const r = await ContextoTenant.ejecutarCon(contexto('a'), () => llamar(mw, '/webhooks/x'));
      expect(r.paso).toBe(true);
    }
  });
});

describe('almacén Redis', () => {
  it('usa INCR + EXPIRE NX + TTL y devuelve el TTL restante', async () => {
    const llamadas: string[] = [];
    const m = {
      incr: (k: string) => llamadas.push(`incr ${k}`),
      expire: (k: string, s: number, modo: string) => llamadas.push(`expire ${k} ${s} ${modo}`),
      ttl: (k: string) => llamadas.push(`ttl ${k}`),
      exec: () =>
        Promise.resolve([
          [null, 4],
          [null, 0],
          [null, 42],
        ] as Array<[Error | null, unknown]>),
    };
    const cliente: ClienteRedisDeLimite = { multi: () => m };
    const l = await new AlmacenDeContadoresRedis(cliente).consumir('k', 60);
    expect(l).toEqual({ cuenta: 4, segundosRestantes: 42 });
    expect(llamadas).toEqual(['incr k', 'expire k 60 NX', 'ttl k']);
  });

  it('propaga el error de Redis', async () => {
    const m = {
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      exec: () => Promise.resolve([[new Error('boom'), null]] as Array<[Error | null, unknown]>),
    };
    await expect(
      new AlmacenDeContadoresRedis({ multi: () => m }).consumir('k', 60),
    ).rejects.toThrow('boom');
  });
});

describe('política desde el entorno', () => {
  it('omisiones razonables, memoria sin REDIS_URL', () => {
    expect(leerPoliticaDeLimiteDeTasa({})).toEqual({
      activo: true,
      porTenant: 600,
      porIp: 300,
      ventanaSegundos: 60,
      almacen: 'memoria',
    });
  });

  it('Redis cuando hay REDIS_URL; valores de entorno', () => {
    const p = leerPoliticaDeLimiteDeTasa({
      REDIS_URL: 'redis://x',
      LIMITE_TASA_POR_TENANT: '10',
      LIMITE_TASA_POR_IP: '5',
      LIMITE_TASA_VENTANA_SEGUNDOS: '30',
      LIMITE_TASA_ACTIVO: 'false',
    });
    expect(p).toEqual({
      activo: false,
      porTenant: 10,
      porIp: 5,
      ventanaSegundos: 30,
      almacen: 'redis',
    });
  });

  it.each([
    [{ LIMITE_TASA_POR_IP: 'abc' }, 'LIMITE_TASA_POR_IP'],
    [{ LIMITE_TASA_POR_TENANT: '0' }, 'LIMITE_TASA_POR_TENANT'],
    [{ LIMITE_TASA_VENTANA_SEGUNDOS: '-5' }, 'LIMITE_TASA_VENTANA_SEGUNDOS'],
    [{ LIMITE_TASA_ACTIVO: 'quizas' }, 'LIMITE_TASA_ACTIVO'],
    [{ LIMITE_TASA_ALMACEN: 'disco' }, 'LIMITE_TASA_ALMACEN'],
    [{ LIMITE_TASA_ALMACEN: 'redis' }, 'REDIS_URL'],
  ])('configuración inválida %j falla con mensaje claro', (entorno, texto) => {
    expect(() => leerPoliticaDeLimiteDeTasa(entorno)).toThrow(texto);
  });
});
