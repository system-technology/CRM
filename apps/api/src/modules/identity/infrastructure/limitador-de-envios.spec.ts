import { describe, expect, it } from 'vitest';
import {
  claveDeLimite,
  politicaDeEnvioDeCodigos,
  TOPE_DE_FALLOS_DE_CODIGO,
  TopeDeFallosDeCodigo,
} from '../application/limitador-de-envios.js';
import {
  type ClienteRedisDeContadores,
  LimitadorDeEnviosRedis,
} from './limitador-de-envios.redis.js';
import { LimitadorDeEnviosEnMemoria } from './limitador-de-envios.en-memoria.js';

describe('claveDeLimite', () => {
  it('no contiene el correo ni la IP, y normaliza el correo', () => {
    const k = claveDeLimite('secreto', 'correo', ' Ana@Ejemplo.com ');
    expect(k).not.toContain('ana');
    expect(k).not.toContain('ejemplo');
    expect(k).toBe(claveDeLimite('secreto', 'correo', 'ana@ejemplo.com'));
    expect(claveDeLimite('secreto', 'ip', '10.1.2.3')).not.toContain('10.1.2.3');
  });

  it('el prefijo propio separa el contador de fallos del de envíos', () => {
    const envio = claveDeLimite('s', 'correo', 'a@b.co');
    const fallos = claveDeLimite('s', 'correo', 'a@b.co', 'viajapro:otp-fallos:');
    expect(envio.startsWith('viajapro:otp-envio:correo:')).toBe(true);
    expect(fallos.startsWith('viajapro:otp-fallos:correo:')).toBe(true);
    expect(fallos).not.toBe(envio);
  });

  it('depende del secreto y separa correo de IP', () => {
    expect(claveDeLimite('a', 'correo', 'x')).not.toBe(claveDeLimite('b', 'correo', 'x'));
    expect(claveDeLimite('a', 'correo', 'x')).not.toBe(claveDeLimite('a', 'ip', 'x'));
  });
});

describe('politicaDeEnvioDeCodigos', () => {
  it('3 por correo y 10 por IP cada 15 minutos por defecto', () => {
    expect(politicaDeEnvioDeCodigos({})).toEqual({
      porCorreo: { maximo: 3, ventanaSegundos: 900 },
      porIp: { maximo: 10, ventanaSegundos: 900 },
    });
  });

  it('se configura y un valor inválido vuelve al defecto', () => {
    const p = politicaDeEnvioDeCodigos({ OTP_ENVIOS_POR_CORREO: '5', OTP_ENVIOS_POR_IP: '0' });
    expect(p.porCorreo.maximo).toBe(5);
    expect(p.porIp.maximo).toBe(10);
  });
});

describe('LimitadorDeEnviosEnMemoria', () => {
  it('permite hasta el máximo y rechaza después', async () => {
    const l = new LimitadorDeEnviosEnMemoria();
    const r: boolean[] = [];
    for (let i = 0; i < 4; i++) r.push(await l.consumir('k', 3, 60));
    expect(r).toEqual([true, true, true, false]);
  });
});

describe('quedaCupo (en memoria)', () => {
  it('no consume y se agota con la cuenta', async () => {
    const l = new LimitadorDeEnviosEnMemoria();
    for (let i = 0; i < 5; i++) expect(await l.quedaCupo('k', 2)).toBe(true);
    await l.consumir('k', 2, 60);
    expect(await l.quedaCupo('k', 2)).toBe(true);
    await l.consumir('k', 2, 60);
    expect(await l.quedaCupo('k', 2)).toBe(false);
  });
});

describe('TopeDeFallosDeCodigo', () => {
  const nuevo = (l = new LimitadorDeEnviosEnMemoria()) => ({
    l,
    tope: new TopeDeFallosDeCodigo(l, 'secreto'),
  });

  it('el tope son 10 fallos en 24 horas', () => {
    expect(TOPE_DE_FALLOS_DE_CODIGO).toEqual({ maximo: 10, ventanaSegundos: 86400 });
  });

  it('consultar no cuenta; cada fallo sí; al décimo se bloquea', async () => {
    const { tope } = nuevo();
    for (let i = 0; i < 5; i++) expect(await tope.estaBloqueado('a@b.co')).toBe(false);
    for (let i = 0; i < 9; i++) await tope.registrarFallo('a@b.co');
    expect(await tope.estaBloqueado('a@b.co')).toBe(false);
    await tope.registrarFallo('a@b.co');
    expect(await tope.estaBloqueado('a@b.co')).toBe(true);
  });

  it('otro correo no se ve afectado, y mayúsculas no cambian el buzón', async () => {
    const { tope } = nuevo();
    for (let i = 0; i < 10; i++) await tope.registrarFallo(' A@B.co ');
    expect(await tope.estaBloqueado('a@b.co')).toBe(true);
    expect(await tope.estaBloqueado('otra@b.co')).toBe(false);
  });

  it('no comparte contador con el de envíos', async () => {
    const { l, tope } = nuevo();
    for (let i = 0; i < 20; i++)
      await l.consumir(claveDeLimite('secreto', 'correo', 'a@b.co'), 3, 900);
    expect(await tope.estaBloqueado('a@b.co')).toBe(false);
    for (let i = 0; i < 10; i++) await tope.registrarFallo('a@b.co');
    expect(await l.consumir(claveDeLimite('secreto', 'correo', 'z@b.co'), 3, 900)).toBe(true);
  });
});

describe('LimitadorDeEnviosRedis', () => {
  function falso() {
    const cuentas = new Map<string, number>();
    const ttls = new Map<string, number>();
    const cliente: ClienteRedisDeContadores = {
      get: (c: string) => Promise.resolve(cuentas.has(c) ? String(cuentas.get(c)) : null),
      multi() {
        let clave = '';
        const m = {
          incr(c: string) {
            clave = c;
            cuentas.set(c, (cuentas.get(c) ?? 0) + 1);
            return m;
          },
          expire(c: string, s: number) {
            if (!ttls.has(c)) ttls.set(c, s);
            return m;
          },
          exec: () =>
            Promise.resolve([[null, cuentas.get(clave)]] as Array<[Error | null, unknown]>),
        };
        return m;
      },
    };
    return { cliente, ttls };
  }

  it('cuenta con TTL y rechaza al superar el máximo', async () => {
    const { cliente, ttls } = falso();
    const l = new LimitadorDeEnviosRedis(cliente);
    expect(await l.consumir('k', 2, 900)).toBe(true);
    expect(await l.consumir('k', 2, 900)).toBe(true);
    expect(await l.consumir('k', 2, 900)).toBe(false);
    expect(ttls.get('k')).toBe(900);
  });

  it('quedaCupo lee sin incrementar', async () => {
    const { cliente } = falso();
    const l = new LimitadorDeEnviosRedis(cliente);
    expect(await l.quedaCupo('k', 2)).toBe(true);
    await l.consumir('k', 2, 60);
    expect(await l.quedaCupo('k', 2)).toBe(true);
    await l.consumir('k', 2, 60);
    expect(await l.quedaCupo('k', 2)).toBe(false);
    expect(await l.quedaCupo('k', 2)).toBe(false);
  });

  it('un fallo de Redis se propaga', async () => {
    const l = new LimitadorDeEnviosRedis({
      get: () => Promise.resolve(null),
      multi: () => ({
        incr: () => undefined,
        expire: () => undefined,
        exec: () => Promise.reject(new Error('Redis caído')),
      }),
    });
    await expect(l.consumir('k', 3, 60)).rejects.toThrow('Redis caído');
  });
});
