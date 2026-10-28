import { Logger } from '@nestjs/common';
import { DomainError } from '@viajapro/domain';
import { describe, expect, it, vi } from 'vitest';
import { DominioExcepcionFilter } from './dominio-excepcion.filter.js';

class Macho extends DomainError {
  readonly code = 'COSA_NO_ENCONTRADO';
}
class Hembra extends DomainError {
  readonly code = 'COSA_NO_ENCONTRADA';
}
class Otro extends DomainError {
  readonly code = 'COSA_MALA';
}

function estadoPara(e: unknown): number {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
  // @ts-expect-error anfitrión mínimo: solo se usa getResponse
  new DominioExcepcionFilter().catch(e, host);
  return status.mock.calls[0]?.[0] as number;
}

describe('DominioExcepcionFilter: no encontrado', () => {
  it('_NO_ENCONTRADO da 404', () => expect(estadoPara(new Macho('x'))).toBe(404));
  it('_NO_ENCONTRADA da 404', () => expect(estadoPara(new Hembra('x'))).toBe(404));
  it('cualquier otro código sigue dando 400', () => expect(estadoPara(new Otro('x'))).toBe(400));
});

describe('DominioExcepcionFilter: errores de cliente de body-parser (AUD-017)', () => {
  const deHttpErrors = (status: number, expose = true) =>
    Object.assign(new Error('x'), { status, expose });
  it('un cuerpo demasiado grande da 413, no 500', () =>
    expect(estadoPara(deHttpErrors(413))).toBe(413));
  it('un JSON malformado da 400', () => expect(estadoPara(deHttpErrors(400))).toBe(400));
  it('un error 5xx o no exponible sigue siendo 500', () => {
    expect(estadoPara(deHttpErrors(500, false))).toBe(500);
    expect(estadoPara(deHttpErrors(413, false))).toBe(500);
    expect(estadoPara(new Error('boom'))).toBe(500);
  });
});

describe('DominioExcepcionFilter: PII fuera de los logs (T-099)', () => {
  it('el log de un error de dominio no lleva el teléfono completo', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    estadoPara(new Otro('Contacto 573001234567 inválido'));
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('573001234567');
    warn.mockRestore();
  });
});
