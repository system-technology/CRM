/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * El middleware de tenant, sin base de datos: el resolutor de acceso es de mentira.
 *
 * Lo central: **la cabecera de desarrollo solo existe con `APP_ENV=local` y sin sesión**, y la
 * lista de rutas sin tenant es EXACTA para la autenticación.
 */
import { UnauthorizedException } from '@nestjs/common';
import { PERMISOS } from '@viajapro/contracts';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type EntradaDeAcceso,
  ResolutorDeAcceso,
  type ResultadoDeAcceso,
  presentaCookieDeSesion,
} from '../puertos/puerto-de-acceso.js';
import { ContextoTenant } from './contexto-tenant.js';
import { TenantMiddleware, esRutaSinTenant } from './tenant.middleware.js';

class Resolutor extends ResolutorDeAcceso {
  constructor(private readonly respuesta: ResultadoDeAcceso) {
    super();
  }
  entradas: EntradaDeAcceso[] = [];
  async resolver(entrada: EntradaDeAcceso): Promise<ResultadoDeAcceso> {
    this.entradas.push(entrada);
    return this.respuesta;
  }
}

const SIN_SESION: ResultadoDeAcceso = { concedido: false, motivo: 'SIN_SESION', cookies: [] };
const CONCEDIDO: ResultadoDeAcceso = {
  concedido: true,
  cookies: ['renovada=1; Path=/'],
  acceso: {
    tenantId: 'tenant-de-la-sesion',
    usuarioId: 'u1',
    identidadId: 'i1',
    sesionId: 's1',
    rol: 'Asesor',
    permisos: new Set(),
  },
};

function peticion(ruta: string, cabeceras: Record<string, string> = {}): Request {
  return { originalUrl: ruta, url: ruta, headers: cabeceras } as unknown as Request;
}
function respuesta() {
  const cookies: string[] = [];
  const res = {
    append: (_n: string, v: string) => cookies.push(v),
    setHeader: () => res,
  } as unknown as Response;
  return { res, cookies };
}

/** Ejecuta el middleware y devuelve el contexto que vio `next()`, o el error. */
async function correr(
  resolutor: ResolutorDeAcceso,
  ruta: string,
  cabeceras: Record<string, string> = {},
): Promise<{ contexto: ReturnType<typeof ContextoTenant.obtenerONulo>; llamado: boolean }> {
  let contexto: ReturnType<typeof ContextoTenant.obtenerONulo> = null;
  let llamado = false;
  const siguiente: NextFunction = () => {
    llamado = true;
    contexto = ContextoTenant.obtenerONulo();
  };
  await new TenantMiddleware(resolutor).use(peticion(ruta, cabeceras), respuesta().res, siguiente);
  return { contexto, llamado };
}

let entornoOriginal: string | undefined;
beforeEach(() => {
  entornoOriginal = process.env['APP_ENV'];
});
afterEach(() => {
  if (entornoOriginal === undefined) delete process.env['APP_ENV'];
  else process.env['APP_ENV'] = entornoOriginal;
});

describe('la cabecera de desarrollo', () => {
  const cabecera = { 'x-dev-tenant-id': 'tenant-de-la-cabecera' };

  it('con APP_ENV=local y sin sesión, fija el tenant con TODOS los permisos', async () => {
    process.env['APP_ENV'] = 'local';
    const { contexto } = await correr(new Resolutor(SIN_SESION), '/api/v1/crm/tablero', cabecera);
    expect(contexto?.tenantId).toBe('tenant-de-la-cabecera');
    expect(contexto?.identidadId).toBeNull();
    expect([...(contexto?.permisos ?? [])].sort()).toEqual([...PERMISOS].sort());
  });

  it.each(['dev', 'staging', 'production', 'test', 'LOCAL', ' local', ''])(
    'con APP_ENV=%j se ignora y la petición es 401',
    async (entorno) => {
      process.env['APP_ENV'] = entorno;
      await expect(
        correr(new Resolutor(SIN_SESION), '/api/v1/crm/tablero', cabecera),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('sin APP_ENV definido se ignora', async () => {
    delete process.env['APP_ENV'];
    await expect(
      correr(new Resolutor(SIN_SESION), '/api/v1/crm/tablero', cabecera),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('una sesión válida gana: el tenant sale de la sesión, no de la cabecera', async () => {
    process.env['APP_ENV'] = 'local';
    const { contexto } = await correr(new Resolutor(CONCEDIDO), '/api/v1/crm/tablero', cabecera);
    expect(contexto?.tenantId).toBe('tenant-de-la-sesion');
  });

  it('con una cookie de sesión que ya no vale, la cabecera tampoco entra', async () => {
    process.env['APP_ENV'] = 'local';
    await expect(
      correr(new Resolutor(SIN_SESION), '/api/v1/crm/tablero', {
        ...cabecera,
        cookie: '__Secure-viajapro.session_token=viejo.firma',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('una sesión con la agencia suspendida no se salta con la cabecera', async () => {
    process.env['APP_ENV'] = 'local';
    const suspendida: ResultadoDeAcceso = {
      concedido: false,
      motivo: 'AGENCIA_SUSPENDIDA',
      cookies: [],
    };
    await expect(
      correr(new Resolutor(suspendida), '/api/v1/crm/tablero', cabecera),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('rutas sin tenant', () => {
  it('las cuatro rutas de autenticación van por coincidencia EXACTA', () => {
    for (const r of [
      '/api/v1/auth/sign-in/email',
      '/api/v1/auth/sign-out',
      '/api/v1/auth/session',
      '/api/v1/auth/tenant-activo',
    ]) {
      expect(esRutaSinTenant(r), r).toBe(true);
    }
  });

  it('el resto del prefijo de autenticación YA NO queda exento', () => {
    for (const r of [
      '/api/v1/auth/',
      '/api/v1/auth/sign-up/email',
      '/api/v1/auth/list-sessions',
      '/api/v1/auth/reset-password',
      '/api/v1/auth/get-session',
      '/api/v1/auth/session/otra',
      '/api/v1/auth/sign-in/email/',
      '/api/v1/auth/SIGN-OUT',
      '/api/v1/auth/session%2F..%2Fx',
    ]) {
      expect(esRutaSinTenant(r), r).toBe(false);
    }
  });

  it('salud y webhooks siguen exentos, y una ruta de negocio no', () => {
    expect(esRutaSinTenant('/salud/listo')).toBe(true);
    expect(esRutaSinTenant('/webhooks/whatsapp')).toBe(true);
    expect(esRutaSinTenant('/api/v1/crm/tablero')).toBe(false);
  });

  it('una ruta exenta no consulta la sesión', async () => {
    const r = new Resolutor(SIN_SESION);
    const { llamado } = await correr(r, '/api/v1/auth/session?x=1');
    expect(llamado).toBe(true);
    expect(r.entradas).toHaveLength(0);
  });
});

describe('cookie de sesión', () => {
  it('se reconoce por el sufijo del nombre, con o sin prefijo __Secure-', () => {
    expect(presentaCookieDeSesion('__Secure-viajapro.session_token=a.b')).toBe(true);
    expect(presentaCookieDeSesion('otra=1; viajapro.session_token=a.b')).toBe(true);
    expect(presentaCookieDeSesion('otra=1')).toBe(false);
    expect(presentaCookieDeSesion('x=session_token')).toBe(false);
    expect(presentaCookieDeSesion(null)).toBe(false);
  });

  it('reenvía el Set-Cookie de renovación que pida el resolutor', async () => {
    const { res, cookies } = respuesta();
    await new TenantMiddleware(new Resolutor(CONCEDIDO)).use(
      peticion('/api/v1/crm/tablero', { cookie: 'x' }),
      res,
      () => undefined,
    );
    expect(cookies).toEqual(['renovada=1; Path=/']);
  });
});
