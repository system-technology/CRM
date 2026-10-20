import { describe, expect, it } from 'vitest';
import { claveDeLimite, politicaDeEnvioDeCodigos } from '../application/limitador-de-envios.js';
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

describe('LimitadorDeEnviosRedis', () => {
  function falso() {
    const cuentas = new Map<string, number>();
    const ttls = new Map<string, number>();
    const cliente: ClienteRedisDeContadores = {
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

  it('un fallo de Redis se propaga', async () => {
    const l = new LimitadorDeEnviosRedis({
      multi: () => ({
        incr: () => undefined,
        expire: () => undefined,
        exec: () => Promise.reject(new Error('Redis caído')),
      }),
    });
    await expect(l.consumir('k', 3, 60)).rejects.toThrow('Redis caído');
  });
});
