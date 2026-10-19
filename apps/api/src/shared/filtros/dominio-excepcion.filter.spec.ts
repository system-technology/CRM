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
