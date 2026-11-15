import { describe, expect, it } from 'vitest';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import { LoggerJson } from './logger-json.js';

function nuevo(): { logger: LoggerJson; lineas: string[] } {
  const lineas: string[] = [];
  return { logger: new LoggerJson((l) => lineas.push(l), 'info'), lineas };
}

describe('LoggerJson (R6, R10)', () => {
  it('un error con texto, telefono, correo y token no los deja salir', () => {
    const { logger, lineas } = nuevo();
    const error = Object.assign(new Error('fallo con ana@agencia.co y +57 300 123 4567'), {
      code: 'E1',
    });
    logger.error(
      'Envio fallido',
      error,
      {
        texto: 'Mi pasaporte es AB123456, viajo el lunes',
        telefono: '+573001234567',
        correo: 'ana@agencia.co',
        token: 'EAAGm0PX4ZCpsBAxxxxxxxxxxxxxxxxxxxxxxxx',
        anidado: { body: 'hola', Access_Token: 'abc' },
        lista: [{ phone: '3001234567' }],
        ok: 'visible',
      },
      'Contexto',
    );
    const salida = lineas.join('\n');
    for (const secreto of [
      'AB123456',
      'viajo el lunes',
      '573001234567',
      '300 123 4567',
      'ana@agencia.co',
      'EAAGm0PX4ZCpsBAxxxx',
      'hola',
      'abc',
    ]) {
      expect(salida).not.toContain(secreto);
    }
    const j = JSON.parse(lineas[0] ?? '{}') as Record<string, unknown>;
    expect(j['context']).toBe('Contexto');
    expect(j['level']).toBe('error');
    expect(salida).toContain('visible');
  });

  it('redacta por forma, aunque la clave no sea sospechosa', () => {
    const { logger, lineas } = nuevo();
    logger.warn('Authorization: Bearer abcdefghijklmnop y postgres://u:clave123@host/db');
    expect(lineas[0]).not.toContain('abcdefghijklmnop');
    expect(lineas[0]).not.toContain('clave123');
  });

  it('incluye tenant_id, trace_id y user_id del contexto; null fuera de petición', () => {
    const { logger, lineas } = nuevo();
    logger.log('fuera');
    ContextoTenant.ejecutarCon(
      { tenantId: 'T1', usuarioId: 'U1', identidadId: null, permisos: new Set(), trazaId: 'R1' },
      () => logger.log('dentro'),
    );
    expect(JSON.parse(lineas[0] ?? '{}')).toMatchObject({ tenant_id: null, trace_id: null });
    expect(JSON.parse(lineas[1] ?? '{}')).toMatchObject({
      tenant_id: 'T1',
      trace_id: 'R1',
      user_id: 'U1',
      msg: 'dentro',
    });
  });

  it('sobrevive a ciclos y respeta el nivel mínimo', () => {
    const { logger, lineas } = nuevo();
    const a: Record<string, unknown> = { x: 1 };
    a['yo'] = a;
    logger.log('ciclo', a);
    logger.debug('no sale');
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain('[circular]');
  });
});
