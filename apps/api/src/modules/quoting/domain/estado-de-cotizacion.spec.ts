import type { EstadoCotizacion } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  esTerminal,
  exigirAdmiteVersiones,
  puedeTransitar,
  transitar,
} from './estado-de-cotizacion.js';
import { CotizacionTerminalError, TransicionDeCotizacionInvalidaError } from './errors.js';

const TODOS: EstadoCotizacion[] = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'];
const PERMITIDAS = new Set([
  'BORRADOR>ENVIADA',
  'ENVIADA>ACEPTADA',
  'ENVIADA>RECHAZADA',
  'ENVIADA>VENCIDA',
]);

describe('transiciones de cotización', () => {
  it.each(TODOS.flatMap((de) => TODOS.map((a) => [de, a] as const)))('%s -> %s', (de, a) => {
    const permitida = PERMITIDAS.has(`${de}>${a}`);
    expect(puedeTransitar(de, a)).toBe(permitida);
    if (permitida) expect(transitar(de, a)).toBe(a);
    else expect(() => transitar(de, a)).toThrow(TransicionDeCotizacionInvalidaError);
  });

  it('los tres finales son terminales y no admiten versiones', () => {
    for (const e of ['ACEPTADA', 'RECHAZADA', 'VENCIDA'] as const) {
      expect(esTerminal(e)).toBe(true);
      expect(() => exigirAdmiteVersiones(e)).toThrow(CotizacionTerminalError);
    }
  });

  it('borrador y enviada admiten versiones', () => {
    expect(() => exigirAdmiteVersiones('BORRADOR')).not.toThrow();
    expect(() => exigirAdmiteVersiones('ENVIADA')).not.toThrow();
  });
});
